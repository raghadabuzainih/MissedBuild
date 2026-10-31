import { createHash } from "node:crypto";
import { and, desc, eq, not, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { repositories, repositoryAnalyses } from "../db/schema/index.js";
import { analysisResultSchema, isPartialResult, type AnalysisEvidence, type SourceFilesSummary } from "../types/analysis.js";
import type { GitHubIssue, GitHubReadme } from "../types/github.js";
import { AppError } from "../utils/appError.js";
import { model } from "../utils/constants.js";
import { redactReadmeAndIssues } from "../utils/secretScan.js";
import { noProgress, startProgress, type ProgressReporter } from "./analysisProgress.js";
import { ANALYSIS_PROMPT_VERSION, generateAnalysis } from "./analysisService.js";
import { getIssues, getReadme } from "./githubService.js";
import { collectSourceFiles, type SourceFiles, type SourceFilesInput } from "./sourceFilesService.js";
import {
  loadStoredIssues,
  loadStoredReadme,
  repositoryColumnsWithoutContent,
  saveIssues,
  saveReadme,
  type RepositoryWithoutContent,
} from "./storedContentService.js";

// One page from GitHub (its maximum), then the most recently updated open
// and closed issues, kept apart: closed issues are history, not current problems.
const ISSUE_FETCH_LIMIT = 100;
const OPEN_ISSUES = 20;
const CLOSED_ISSUES = 10;

// The most recently updated open and closed issues (inputs are newest first).
function pickIssues<I extends { state: "open" | "closed" }>(issues: I[]): { picked: I[]; note: string | null } {
  const open = issues.filter((issue) => issue.state === "open");
  const closed = issues.filter((issue) => issue.state === "closed");
  const picked = [...open.slice(0, OPEN_ISSUES), ...closed.slice(0, CLOSED_ISSUES)];
  const note =
    open.length > OPEN_ISSUES || closed.length > CLOSED_ISSUES
      ? `Only the ${OPEN_ISSUES} most recently updated open issues and ${CLOSED_ISSUES} closed issues were read.`
      : null;
  return { picked, note };
}

// The README text is not loaded here: stored content is read only through storedContentService.
type RepositoryRow = RepositoryWithoutContent;
type AnalysisRow = typeof repositoryAnalyses.$inferSelect;

async function findRepository(id: string): Promise<RepositoryRow> {
  const [repo] = await db.select(repositoryColumnsWithoutContent).from(repositories).where(eq(repositories.id, id));
  // Unavailable repositories are hidden everywhere.
  if (!repo || repo.unavailableAt) throw new AppError(404, "REPOSITORY_NOT_FOUND", "Repository not found.");
  return repo;
}

// Where collectEvidence reads and stores; tests pass their own.
export type EvidenceSources = {
  fetchReadme: (owner: string, name: string) => Promise<GitHubReadme | null>;
  fetchIssues: (owner: string, name: string, limit: number) => Promise<GitHubIssue[]>;
  saveReadme: (repoId: string, readme: GitHubReadme | null) => Promise<void>;
  saveIssues: (repoId: string, issues: GitHubIssue[]) => Promise<void>;
  // Raw stored copies, used only when GitHub fails; scanned like fresh data.
  loadStoredReadme: (repoId: string) => Promise<{ url: string; content: string } | null>;
  loadStoredIssues: (repoId: string, limit: number) => Promise<StoredIssue[]>;
  // Selected, scanned source-file excerpts (fetched fresh; nothing is stored).
  fetchSourceFiles: (input: SourceFilesInput) => Promise<SourceFiles | null>;
};

type StoredIssue = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  stateReason?: "completed" | "not_planned" | "reopened" | null;
  htmlUrl: string;
};

const defaultSources: EvidenceSources = {
  fetchReadme: getReadme,
  fetchIssues: getIssues,
  saveReadme,
  saveIssues,
  loadStoredReadme,
  loadStoredIssues,
  fetchSourceFiles: collectSourceFiles,
};

// Evidence notes about the source code (counts only, never content).
function sourceFileNotes(summary: SourceFilesSummary): string[] {
  const notes: string[] = [];
  const partial = summary.files.filter((file) => file.truncated).length;
  notes.push(
    summary.files.length === 0
      ? "No source files could be included."
      : `Source code: ${summary.files.length} selected file(s) were read${partial > 0 ? ` (${partial} only in part)` : ""}; the rest of the code was not read.`,
  );
  const withheld = summary.unused.filter((file) => file.reason === "private_key" || file.reason === "too_many_secrets").length;
  if (withheld > 0) notes.push(`${withheld} source file(s) were withheld because they appear to contain credentials.`);
  const redacted = summary.files.filter((file) => file.redactions > 0).length;
  if (redacted > 0) notes.push(`Possible credentials were redacted from ${redacted} source file(s).`);
  if (summary.treeTruncated) notes.push("GitHub listed only part of the repository's files.");
  return notes;
}

export type EvidenceRepository = Pick<
  RepositoryRow,
  "id" | "owner" | "name" | "fullName" | "description" | "language" | "topics"
>;

// Fresh README and issues from GitHub, stored as they arrive. If GitHub
// fails, the stored copy is used and the gap is noted in the result.
// Whichever copy is used, it is scanned for credentials before it is
// returned: the result is the only input to the analysis prompt. Source
// files are fetched fresh and arrive already scanned.
// Exported for tests.
export async function collectEvidence(
  repo: EvidenceRepository,
  sources: EvidenceSources = defaultSources,
  progress: ProgressReporter = noProgress,
): Promise<AnalysisEvidence> {
  progress.stage("readme_issues");
  const notes: string[] = [];
  const [readmeResult, issuesResult] = await Promise.allSettled([
    sources.fetchReadme(repo.owner, repo.name),
    sources.fetchIssues(repo.owner, repo.name, ISSUE_FETCH_LIMIT),
  ]);
  for (const result of [readmeResult, issuesResult]) {
    if (result.status === "rejected" && !(result.reason instanceof AppError)) throw result.reason;
  }
  const githubError = [readmeResult, issuesResult].find((r) => r.status === "rejected")?.reason as AppError | undefined;

  // Raw (unscanned) README and issues; only their scanned copies leave this function.
  let readme: { url: string; content: string } | null;
  if (readmeResult.status === "fulfilled") {
    await sources.saveReadme(repo.id, readmeResult.value);
    readme = readmeResult.value && { url: readmeResult.value.htmlUrl, content: readmeResult.value.content };
    if (!readme) notes.push("The repository has no README.");
  } else {
    readme = await sources.loadStoredReadme(repo.id);
    notes.push(
      readme
        ? "The README could not be refreshed from GitHub; a stored copy was used."
        : "The README could not be fetched from GitHub.",
    );
  }

  let issues: StoredIssue[];
  if (issuesResult.status === "fulfilled") {
    await sources.saveIssues(repo.id, issuesResult.value);
    issues = issuesResult.value;
    if (issues.length === 0) notes.push("The repository has no issues to read.");
  } else {
    issues = await sources.loadStoredIssues(repo.id, ISSUE_FETCH_LIMIT);
    notes.push(
      issues.length > 0
        ? "Issues could not be refreshed from GitHub; stored copies were used."
        : "Issues could not be fetched from GitHub.",
    );
  }

  // GitHub failed and nothing usable is stored: report the GitHub error.
  if (githubError && !readme && issues.length === 0) throw githubError;

  const { picked, note: issuesNote } = pickIssues(issues);
  issues = picked;

  // Likely credentials are redacted (or the README/issue withheld) before
  // anything reaches the AI. The stored copies stay as GitHub returned them.
  // From here on only the scanned copies exist in this function, so a
  // withheld README or issue cannot fall back to its original text.
  const scanned = redactReadmeAndIssues(readme, issues);
  notes.push(...scanned.notes);

  if (issuesNote) notes.push(issuesNote);

  progress.stage("source_files");

  // Source code, after the README is scanned: its scanned text only ranks files it mentions.
  let files: AnalysisEvidence["files"] = [];
  let map: AnalysisEvidence["map"] = null;
  let sourceFiles: SourceFilesSummary | null = null;
  try {
    const collected = await sources.fetchSourceFiles({
      owner: repo.owner,
      name: repo.name,
      language: repo.language,
      readme: scanned.readme?.content ?? null,
    });
    if (collected) {
      files = collected.files;
      map = collected.map;
      sourceFiles = collected.summary;
      notes.push(...sourceFileNotes(collected.summary));
    } else {
      notes.push("The repository has no files to read.");
    }
  } catch (error) {
    // The analysis continues from the README and issues.
    if (!(error instanceof AppError)) throw error;
    notes.push("Source files could not be read from GitHub.");
    progress.skip();
  }

  progress.stage("prepare");

  if (!scanned.readme && scanned.issues.length === 0 && files.length === 0) {
    throw new AppError(422, "INSUFFICIENT_EVIDENCE", "This repository has no README, issues or source files to analyze.");
  }

  return {
    fullName: repo.fullName,
    description: repo.description,
    language: repo.language,
    topics: repo.topics,
    readme: scanned.readme,
    issues: scanned.issues,
    files,
    map,
    sourceFiles,
    notes,
  };
}

// Identifies the evidence, not how it was fetched: notes are left out.
function fingerprintEvidence(evidence: AnalysisEvidence): string {
  const content = {
    description: evidence.description,
    language: evidence.language,
    topics: evidence.topics,
    readme: evidence.readme?.content ?? null,
    issues: [...evidence.issues]
      .sort((a, b) => a.number - b.number)
      .map((issue) => [issue.number, issue.state, issue.title, issue.body]),
    // What was sent, not the commit: a new commit that leaves these excerpts unchanged reuses the result.
    files: evidence.files.map((file) => [file.path, file.rendered]),
    map: evidence.map?.text ?? null,
  };
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

function toResponse(row: AnalysisRow, repo: RepositoryRow, cached: boolean) {
  const result = analysisResultSchema.safeParse(row.result);
  if (!result.success) throw new Error(`Stored analysis ${row.id} does not match the result schema.`);
  return {
    id: row.id,
    repositoryId: row.repositoryId,
    createdAt: row.createdAt,
    model: row.model,
    promptVersion: row.promptVersion,
    cached,
    hasNewCommits: repo.githubPushedAt !== null && repo.githubPushedAt > row.createdAt,
    result: result.data,
  };
}

// A stored partial analysis (a section of the AI's reply was unusable). The
// table name is spelled out: in ON CONFLICT ... WHERE it must mean the stored row.
// Exported for tests.
export const storedIsPartial = sql`(${repositoryAnalyses}.${sql.identifier(repositoryAnalyses.result.name)} -> 'unavailableSections') is not null`;

async function runAnalysis(repoId: string) {
  const progress = startProgress(repoId);
  try {
    const repo = await findRepository(repoId);
    const evidence = await collectEvidence(repo, defaultSources, progress);
    const evidenceFingerprint = fingerprintEvidence(evidence);

    // Unchanged evidence and prompt: return the stored result, no AI call.
    // Never a partial one: it is not a complete answer for this evidence.
    const sameKey = and(
      eq(repositoryAnalyses.repositoryId, repo.id),
      eq(repositoryAnalyses.evidenceFingerprint, evidenceFingerprint),
      eq(repositoryAnalyses.promptVersion, ANALYSIS_PROMPT_VERSION),
    );
    const [cached] = await db.select().from(repositoryAnalyses).where(and(sameKey, not(storedIsPartial)));
    if (cached) {
      progress.finish("cached");
      return toResponse(cached, repo, true);
    }

    const result = await generateAnalysis(evidence, progress);
    progress.stage("save");
    const [stored] = await db
      .insert(repositoryAnalyses)
      .values({ repositoryId: repo.id, evidenceFingerprint, promptVersion: ANALYSIS_PROMPT_VERSION, model, result })
      // Same key: a stored partial analysis is replaced by this one; a complete one is kept.
      .onConflictDoUpdate({
        target: [repositoryAnalyses.repositoryId, repositoryAnalyses.evidenceFingerprint, repositoryAnalyses.promptVersion],
        set: { result, model, createdAt: sql`now()` },
        setWhere: storedIsPartial,
      })
      .returning();
    // Another process stored a complete analysis for the same key meanwhile: return that one.
    const row = stored ?? (await db.select().from(repositoryAnalyses).where(sameKey))[0];
    const response = toResponse(row, repo, !stored);
    progress.finish(isPartialResult(response.result) ? "partial" : "completed");
    return response;
  } catch (error) {
    progress.fail(error);
    throw error;
  }
}

// Concurrent requests for the same repository share one run (single process).
const inFlight = new Map<string, ReturnType<typeof runAnalysis>>();

// Runs only when the user asks; nothing re-analyzes automatically.
export function analyzeRepository(repoId: string): ReturnType<typeof runAnalysis> {
  const running = inFlight.get(repoId);
  if (running) return running;
  const run = runAnalysis(repoId).finally(() => inFlight.delete(repoId));
  inFlight.set(repoId, run);
  return run;
}

export async function getLatestAnalysis(repoId: string) {
  const repo = await findRepository(repoId);
  const [latest] = await db
    .select()
    .from(repositoryAnalyses)
    .where(eq(repositoryAnalyses.repositoryId, repo.id))
    .orderBy(desc(repositoryAnalyses.createdAt))
    .limit(1);
  if (!latest) throw new AppError(404, "ANALYSIS_NOT_FOUND", "This repository has not been analyzed yet.");
  return toResponse(latest, repo, true);
}
