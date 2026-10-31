import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { excluded } from "../db/excluded.js";
import { db } from "../db/index.js";
import { repositories, searches, searchRepositories } from "../db/schema/index.js";
import type { GitHubReadme, GitHubRepository } from "../types/github.js";
import { AppError } from "../utils/appError.js";
import { ideaTerms, rankByRelevance, scoreRelevance } from "../utils/relevance.js";
import { checkQuery, EMPTY_QUERY_QUESTION, fingerprintQuery } from "../utils/searchQuery.js";
import { classifyRepositories } from "./classificationService.js";
import { getReadme, searchRepositories as searchGitHub } from "./githubService.js";
import { createAutoAnalysis, getAutoAnalysisForSearch, startAutoAnalysis } from "./ideaAnalysisService.js";
import { loadReadmesForRanking, saveReadme } from "./storedContentService.js";
import { refineQuery } from "./queryRefinementService.js";
import { repositoryCardColumns, toRepositoryCard } from "./repositoryService.js";

// Up to this many candidates are fetched from GitHub; only relevant ones are
// kept, at most MAX_RESULTS, ranked closest match first. Relevance matters
// more than filling every slot.
const MAX_CANDIDATES = 10;
const MAX_RESULTS = 5;
const README_CONCURRENCY = 5;

// Stored in `searches.warnings`; the frontend maps them to messages.
// None of them change the search status.
export const SearchWarning = {
  AiRefinementFailed: "AI_REFINEMENT_FAILED",
  GitHubIncompleteResults: "GITHUB_INCOMPLETE_RESULTS",
  AiClassificationFailed: "AI_CLASSIFICATION_FAILED",
  ReadmeFetchIncomplete: "README_FETCH_INCOMPLETE",
  // Some GitHub results were left out as unrelated (see filtered_count).
  ResultsFiltered: "RESULTS_FILTERED",
} as const;

type SearchUpdate = Partial<typeof searches.$inferInsert>;

async function updateSearch(id: string, values: SearchUpdate): Promise<void> {
  await db.update(searches).set(values).where(eq(searches.id, id));
}

async function finishSearch(id: string, values: SearchUpdate): Promise<void> {
  await updateSearch(id, { ...values, stage: null, completedAt: new Date() });
}

export async function createSearch(query: string): Promise<{ id: string; status: string }> {
  const fingerprint = fingerprintQuery(query);

  // An identical search that is still running is reused instead of starting a second job.
  const [running] = await db
    .select({ id: searches.id, status: searches.status })
    .from(searches)
    .where(and(eq(searches.fingerprint, fingerprint), eq(searches.status, "processing")))
    .limit(1);
  if (running) return running;

  const [created] = await db
    .insert(searches)
    .values({ query, fingerprint })
    .returning({ id: searches.id, status: searches.status });

  void runSearch(created.id, query);
  return created;
}

// Background job. Never rejects: any failure is stored on the search.
async function runSearch(id: string, query: string): Promise<void> {
  try {
    await executeSearch(id, query);
  } catch (error) {
    console.error(`Search ${id} failed:`, error);
    const known = error instanceof AppError;
    await finishSearch(id, {
      status: "failed",
      errorCode: known ? error.code : "INTERNAL_ERROR",
      errorMessage: known ? error.message : "The search failed. Please try again.",
    }).catch((updateError) => console.error(`Could not mark search ${id} as failed:`, updateError));
  }
}

async function executeSearch(id: string, query: string): Promise<void> {
  const warnings: string[] = [];
  const check = checkQuery(query);

  if (check.kind === "empty") {
    await finishSearch(id, { status: "needs_clarification", clarificationQuestion: EMPTY_QUERY_QUESTION });
    return;
  }

  let githubQueries: string[];
  let aiRefined = false;
  if (check.kind === "clear") {
    githubQueries = [check.githubQuery];
  } else {
    await updateSearch(id, { stage: "refining" });
    const refinement = await refineQuery(query);
    if (refinement?.kind === "clarification") {
      await finishSearch(id, {
        status: "needs_clarification",
        clarificationQuestion: refinement.question,
        aiRefined: true,
      });
      return;
    }
    if (refinement) {
      githubQueries = refinement.queries;
      aiRefined = true;
    } else {
      githubQueries = [check.fallbackQuery];
      warnings.push(SearchWarning.AiRefinementFailed);
    }
  }

  await updateSearch(id, { stage: "searching_github", refinedQueries: githubQueries, aiRefined, warnings });

  // Queries run in order, each asking only for the candidates still missing,
  // so later queries run only when earlier ones return fewer than MAX_CANDIDATES.
  const found = new Map<number, GitHubRepository>();
  const executedQueries: string[] = [];
  let githubError: AppError | null = null;
  for (const githubQuery of githubQueries) {
    if (found.size >= MAX_CANDIDATES) break;
    executedQueries.push(githubQuery);
    try {
      const result = await searchGitHub(githubQuery, MAX_CANDIDATES - found.size);
      if (result.incompleteResults && !warnings.includes(SearchWarning.GitHubIncompleteResults)) {
        warnings.push(SearchWarning.GitHubIncompleteResults);
      }
      for (const repo of result.repositories) {
        if (!found.has(repo.githubId)) found.set(repo.githubId, repo);
      }
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      // A rate limit or outage would fail the remaining queries too.
      githubError = error;
      break;
    }
  }

  const candidates = [...found.values()].slice(0, MAX_CANDIDATES);
  // Only the queries actually sent to GitHub are shown as "Searched GitHub for".
  const finalFields = {
    errorCode: githubError?.code ?? null,
    errorMessage: githubError?.message ?? null,
    refinedQueries: executedQueries,
  };

  if (candidates.length === 0) {
    await finishSearch(id, { status: githubError ? "failed" : "no_results", warnings, ...finalFields });
    return;
  }

  await updateSearch(id, { stage: "processing_results" });
  const candidateIds = await saveCandidates(candidates);
  const rows = candidates.map((repo) => ({ id: candidateIds.get(repo.githubId)!, repo }));

  // READMEs first: they count for relevance and are used for classification.
  const { readmes, complete } = await ensureReadmes(rows);
  if (!complete) warnings.push(SearchWarning.ReadmeFetchIncomplete);

  // Relevance check (no unrelated repository fills a slot), then the closest
  // match first; the rank stored with the search is this order, not GitHub's.
  const terms = ideaTerms(query, executedQueries);
  const scored = rows.map((row, githubIndex) => ({
    item: row,
    githubIndex,
    relevance: scoreRelevance(terms, {
      name: row.repo.name,
      description: row.repo.description,
      topics: row.repo.topics,
      readme: readmes.has(row.id) ? readmes.get(row.id)! : null,
    }),
  }));
  const relevant = scored.filter((entry) => entry.relevance.relevant);
  const kept = rankByRelevance(relevant).slice(0, MAX_RESULTS);
  const filteredCount = rows.length - relevant.length;
  if (filteredCount > 0) warnings.push(SearchWarning.ResultsFiltered);

  if (kept.length === 0) {
    await finishSearch(id, { status: githubError ? "failed" : "no_results", warnings, filteredCount, ...finalFields });
    return;
  }

  await linkResults(id, kept.map((row) => row.id));
  warnings.push(...(await classifyNewRepositories(kept.map((row) => row.id), readmes)));

  // The closest match with enough evidence is analyzed automatically (one at
  // most). The job is created before the search finishes, so polling never
  // sees a finished search without it.
  const autoAnalysisId = await createAutoAnalysis(id);

  const partial = githubError !== null || warnings.includes(SearchWarning.GitHubIncompleteResults);
  await finishSearch(id, {
    status: partial ? "partial" : "completed",
    resultCount: kept.length,
    filteredCount,
    warnings,
    ...finalFields,
  });
  startAutoAnalysis(autoAnalysisId, id);
}

// Saves (or refreshes) every candidate in the repository cache; returns IDs by GitHub ID.
async function saveCandidates(results: GitHubRepository[]): Promise<Map<number, string>> {
  const now = new Date();
  // Refreshes GitHub metadata only; README, ETag and classification are left alone.
  const saved = await db
    .insert(repositories)
    .values(results.map((repo) => ({ ...repo, syncedAt: now })))
    .onConflictDoUpdate({
      target: repositories.githubId,
      set: {
        fullName: excluded(repositories.fullName),
        owner: excluded(repositories.owner),
        name: excluded(repositories.name),
        htmlUrl: excluded(repositories.htmlUrl),
        description: excluded(repositories.description),
        language: excluded(repositories.language),
        topics: excluded(repositories.topics),
        stars: excluded(repositories.stars),
        forks: excluded(repositories.forks),
        openIssues: excluded(repositories.openIssues),
        githubPushedAt: excluded(repositories.githubPushedAt),
        githubUpdatedAt: excluded(repositories.githubUpdatedAt),
        archived: excluded(repositories.archived),
        unavailableAt: null,
        syncedAt: now,
        updatedAt: now,
      },
    })
    .returning({ id: repositories.id, githubId: repositories.githubId });
  return new Map(saved.map((row) => [row.githubId, row.id]));
}

// Only the kept results belong to the search, ranked in order.
async function linkResults(searchId: string, repositoryIds: string[]): Promise<void> {
  await db.insert(searchRepositories).values(repositoryIds.map((repositoryId, index) => ({ searchId, repositoryId, rank: index + 1 })));
}

// The README of every candidate: the stored copy, or fetched (a few at a time)
// when it was never checked. The first failed batch (rate limit, outage)
// stops further fetching. Map values: the text, or null when none exists;
// candidates whose README is unknown are absent.
async function ensureReadmes(rows: { id: string; repo: GitHubRepository }[]): Promise<{ readmes: Map<string, string | null>; complete: boolean }> {
  const stored = await loadReadmesForRanking(rows.map((row) => row.id));
  const readmes = new Map<string, string | null>();
  for (const [repoId, state] of stored) if (state.checked) readmes.set(repoId, state.content);

  const missing = rows.filter((row) => !readmes.has(row.id));
  let complete = true;
  for (let start = 0; start < missing.length && complete; start += README_CONCURRENCY) {
    const batch = missing.slice(start, start + README_CONCURRENCY);
    const results = await Promise.allSettled(batch.map(({ repo }) => getReadme(repo.owner, repo.name)));
    for (const [index, result] of results.entries()) {
      if (result.status === "rejected") {
        complete = false;
        // AppErrors are already logged by the GitHub service.
        if (!(result.reason instanceof AppError)) console.error("README fetch failed:", result.reason);
        continue;
      }
      const readme: GitHubReadme | null = result.value;
      // A null README means "checked, none exists" and is stored too.
      await saveReadme(batch[index].id, readme);
      readmes.set(batch[index].id, readme?.content ?? null);
    }
  }
  return { readmes, complete };
}

// A repository is classified once, when first kept by a search: only rows
// without `classified_at` are processed. Returns warnings for the search.
async function classifyNewRepositories(repositoryIds: string[], readmes: Map<string, string | null>): Promise<string[]> {
  const rows = await db
    .select({
      id: repositories.id,
      fullName: repositories.fullName,
      description: repositories.description,
      topics: repositories.topics,
    })
    .from(repositories)
    .where(and(inArray(repositories.id, repositoryIds), isNull(repositories.classifiedAt)));
  if (rows.length === 0) return [];

  // The README is redacted for credentials inside classification (readmeExcerpt).
  const { classifications, aiFailed } = await classifyRepositories(rows.map((row) => ({ ...row, readme: readmes.get(row.id) ?? null })));

  const now = new Date();
  await db.transaction(async (tx) => {
    for (const [index, row] of rows.entries()) {
      const classification = classifications[index];
      await tx
        .update(repositories)
        .set({
          categoryId: classification.categoryId,
          categoryConfidence: classification.confidence,
          categoryMethod: classification.method,
          categoryReason: classification.reason,
          classifiedAt: now,
          updatedAt: now,
        })
        // Another search may have classified it meanwhile; the first one wins.
        .where(and(eq(repositories.id, row.id), isNull(repositories.classifiedAt)));
    }
  });

  return aiFailed ? [SearchWarning.AiClassificationFailed] : [];
}

export async function getSearch(id: string) {
  const [search] = await db.select().from(searches).where(eq(searches.id, id));
  if (!search) throw new AppError(404, "SEARCH_NOT_FOUND", "Search not found.");

  const hasResults = search.status === "completed" || search.status === "partial";
  const rows = hasResults
    ? await db
        .select({ rank: searchRepositories.rank, ...repositoryCardColumns })
        .from(searchRepositories)
        .innerJoin(repositories, eq(searchRepositories.repositoryId, repositories.id))
        // Unavailable repositories are hidden.
        .where(and(eq(searchRepositories.searchId, id), isNull(repositories.unavailableAt)))
        .orderBy(asc(searchRepositories.rank))
    : [];

  return {
    id: search.id,
    query: search.query,
    status: search.status,
    stage: search.stage,
    aiRefined: search.aiRefined,
    refinedQueries: search.refinedQueries,
    clarificationQuestion: search.clarificationQuestion,
    error: search.errorCode ? { code: search.errorCode, message: search.errorMessage } : null,
    warnings: search.warnings,
    resultCount: search.resultCount,
    filteredCount: search.filteredCount,
    createdAt: search.createdAt,
    completedAt: search.completedAt,
    repositories: rows.map(toRepositoryCard),
    // The automatic analysis of the closest match (null when the search had no results).
    autoAnalysis: await getAutoAnalysisForSearch(id),
  };
}

// A restart kills running background jobs; mark them failed so polling ends.
export async function failInterruptedSearches(): Promise<number> {
  const interrupted = await db
    .update(searches)
    .set({
      status: "failed",
      stage: null,
      errorCode: "SEARCH_INTERRUPTED",
      errorMessage: "The search was interrupted. Please try again.",
      completedAt: new Date(),
    })
    .where(eq(searches.status, "processing"))
    .returning({ id: searches.id });
  return interrupted.length;
}
