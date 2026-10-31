import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { ideaAnalyses, repositories, repositoryAnalyses, searchRepositories } from "../db/schema/index.js";
import { ideaAnalysisEntrySchema, type IdeaAnalysisEntry } from "../types/ideaAnalysis.js";
import { pickForAutoAnalysis, type AnalysisCandidate } from "../utils/analysisSelection.js";
import { AppError } from "../utils/appError.js";
import { analyzeRepository } from "./repositoryAnalysisService.js";
import { loadReadmeLengths } from "./storedContentService.js";

// The automatic analysis of a search: only the closest match that has enough
// evidence, with the regular analysis pipeline (analyzeRepository,
// unchanged). One repository at most; a saved analysis is shown instead of
// analyzing again; a failure is reported, never followed by another repository.
// Every other result is analyzed only when the user asks.
// (Stored in idea_analyses; comparisonService is kept, unused, for a possible
// manual comparison later.)

// Codes that come from AI calls Meta has answered or timed out on: paid.
const PAID_FAILURES = new Set(["AI_ANALYSIS_FAILED", "AI_ANALYSIS_TIMEOUT", "AI_ANALYSIS_INVALID"]);
// Codes raised before any Meta call (evidence collection, size checks).
const UNPAID_FAILURES = new Set([
  "INSUFFICIENT_EVIDENCE",
  "ANALYSIS_PROMPT_TOO_LARGE",
  "REPOSITORY_NOT_FOUND",
  "REPOSITORY_UNAVAILABLE",
  "GITHUB_RATE_LIMITED",
  "GITHUB_UNAVAILABLE",
  "GITHUB_ERROR",
]);

type IdeaAnalysisUpdate = Partial<typeof ideaAnalyses.$inferInsert>;

// Everything the job reads and writes; tests pass their own.
export type AutoAnalysisDeps = {
  loadCandidates: (searchId: string) => Promise<AnalysisCandidate[]>;
  // The latest stored analysis of a repository, of any prompt version.
  latestAnalysis: (repositoryId: string) => Promise<{ id: string } | null>;
  analyze: (repositoryId: string) => Promise<{ id: string; cached: boolean }>;
  save: (id: string, values: IdeaAnalysisUpdate) => Promise<void>;
  now: () => Date;
};

async function loadCandidates(searchId: string): Promise<AnalysisCandidate[]> {
  const rows = await db
    .select({
      repositoryId: repositories.id,
      fullName: repositories.fullName,
      rank: searchRepositories.rank,
      openIssues: repositories.openIssues,
    })
    .from(searchRepositories)
    .innerJoin(repositories, eq(searchRepositories.repositoryId, repositories.id))
    .where(and(eq(searchRepositories.searchId, searchId), isNull(repositories.unavailableAt)))
    .orderBy(asc(searchRepositories.rank));
  const lengths = await loadReadmeLengths(rows.map((row) => row.repositoryId));
  return rows.map((row) => ({ ...row, readmeLength: lengths.get(row.repositoryId) ?? 0 }));
}

async function latestAnalysis(repositoryId: string): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: repositoryAnalyses.id })
    .from(repositoryAnalyses)
    .where(eq(repositoryAnalyses.repositoryId, repositoryId))
    .orderBy(desc(repositoryAnalyses.createdAt))
    .limit(1);
  return row ?? null;
}

async function saveIdeaAnalysis(id: string, values: IdeaAnalysisUpdate): Promise<void> {
  await db.update(ideaAnalyses).set(values).where(eq(ideaAnalyses.id, id));
}

const defaultDeps: AutoAnalysisDeps = {
  loadCandidates,
  latestAnalysis,
  analyze: analyzeRepository,
  save: saveIdeaAnalysis,
  now: () => new Date(),
};

// true: a paid Meta call was made; false: it failed before one; null: unknown.
function paidCallMade(error: unknown): boolean | null {
  if (!(error instanceof AppError)) return null;
  if (PAID_FAILURES.has(error.code)) return true;
  if (UNPAID_FAILURES.has(error.code)) return false;
  return null;
}

// The whole job. Exported for tests (with their own deps).
export async function runAutoAnalysisJob(jobId: string, searchId: string, deps: AutoAnalysisDeps = defaultDeps): Promise<void> {
  await deps.save(jobId, { stage: "selecting" });
  const picked = pickForAutoAnalysis(await deps.loadCandidates(searchId));
  if (!picked) {
    await deps.save(jobId, {
      status: "no_candidates",
      stage: null,
      errorCode: "NO_SUITABLE_REPOSITORIES",
      errorMessage: "None of the repositories found has enough README or issue content to analyze, so nothing was analyzed automatically. No AI request was made.",
      completedAt: deps.now(),
    });
    return;
  }

  const entry: IdeaAnalysisEntry = {
    repositoryId: picked.candidate.repositoryId,
    fullName: picked.candidate.fullName,
    selectionReason: picked.reason,
    status: "running",
    analysisId: null,
    cached: false,
    errorCode: null,
    errorMessage: null,
    paidCallMade: null,
    replacedBy: null,
    replaces: null,
  };

  // Already analyzed (any prompt version): show it, with no new AI call.
  const saved = await deps.latestAnalysis(entry.repositoryId);
  if (saved) {
    Object.assign(entry, { status: "succeeded", analysisId: saved.id, cached: true });
    await deps.save(jobId, { status: "completed", stage: null, repositories: [entry], completedAt: deps.now() });
    return;
  }

  await deps.save(jobId, { stage: "analyzing", repositories: [{ ...entry }] });
  try {
    const outcome = await deps.analyze(entry.repositoryId);
    Object.assign(entry, { status: "succeeded", analysisId: outcome.id, cached: outcome.cached });
    await deps.save(jobId, { status: "completed", stage: null, repositories: [entry], completedAt: deps.now() });
  } catch (error) {
    const known = error instanceof AppError;
    if (!known) console.error(`Automatic analysis ${jobId}: analysis of ${entry.repositoryId} failed:`, error);
    Object.assign(entry, {
      status: "failed",
      errorCode: known ? error.code : "INTERNAL_ERROR",
      errorMessage: known ? error.message : "The analysis failed.",
      paidCallMade: paidCallMade(error),
    });
    // No other repository is analyzed automatically; the user decides.
    await deps.save(jobId, {
      status: "failed",
      stage: null,
      repositories: [entry],
      errorCode: entry.errorCode,
      errorMessage: entry.errorMessage,
      completedAt: deps.now(),
    });
  }
}

// Background wrapper: never rejects; any failure is stored on the job.
async function runInBackground(jobId: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.error(`Automatic analysis ${jobId} failed:`, error);
    await saveIdeaAnalysis(jobId, {
      status: "failed",
      stage: null,
      errorCode: "INTERNAL_ERROR",
      errorMessage: "The automatic analysis failed. You can analyze the repository yourself.",
      completedAt: new Date(),
    }).catch((saveError) => console.error(`Could not mark automatic analysis ${jobId} as failed:`, saveError));
  }
}

export async function createAutoAnalysis(searchId: string): Promise<string> {
  const [created] = await db.insert(ideaAnalyses).values({ searchId, stage: "selecting" }).returning({ id: ideaAnalyses.id });
  return created.id;
}

export function startAutoAnalysis(jobId: string, searchId: string): void {
  void runInBackground(jobId, () => runAutoAnalysisJob(jobId, searchId));
}

export async function getAutoAnalysisForSearch(searchId: string) {
  const [job] = await db.select().from(ideaAnalyses).where(eq(ideaAnalyses.searchId, searchId));
  if (!job) return null;
  const [entry] = job.repositories.map((e) => ideaAnalysisEntrySchema.parse(e));
  return {
    status: job.status,
    stage: job.stage,
    repository: entry ?? null,
    error: job.errorCode ? { code: job.errorCode, message: job.errorMessage } : null,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  };
}

// A restart kills running jobs; mark them (and their unfinished entry) failed.
export async function failInterruptedIdeaAnalyses(): Promise<number> {
  const running = await db.select().from(ideaAnalyses).where(eq(ideaAnalyses.status, "processing"));
  for (const job of running) {
    const entries = job.repositories.map((entry) =>
      entry.status === "pending" || entry.status === "running"
        ? { ...entry, status: "failed" as const, errorCode: "IDEA_ANALYSIS_INTERRUPTED", errorMessage: "The analysis was interrupted.", paidCallMade: null }
        : entry,
    );
    await saveIdeaAnalysis(job.id, {
      status: "failed",
      stage: null,
      repositories: entries,
      errorCode: "IDEA_ANALYSIS_INTERRUPTED",
      errorMessage: "The automatic analysis was interrupted. You can analyze the repository yourself.",
      completedAt: new Date(),
    });
  }
  return running.length;
}
