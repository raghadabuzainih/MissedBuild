import { and, asc, count, desc, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "../db/index.js";
import { repositories, searches, searchRepositories } from "../db/schema/index.js";
import { ANALYSIS_PROMPT_VERSION } from "../utils/analysisVersion.js";
import { AppError } from "../utils/appError.js";
import { categories, FALLBACK_CATEGORY_ID, getCategory } from "./categoryService.js";
import { getRepository } from "./githubService.js";
import { hasStoredReadme } from "./storedContentService.js";

// Opening a repository synced longer ago than this refetches it from GitHub.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

// The outer query's repository ID, always with its table name. In a query on
// `repositories` alone, Drizzle writes `${repositories.id}` as a bare "id",
// which inside a subquery on repository_analyses means that table's own id.
const outerRepositoryId = sql`${repositories}.${sql.identifier(repositories.id.name)}`;

// The fields every repository list shows; README content and ETag are never sent.
export const repositoryCardColumns = {
  id: repositories.id,
  fullName: repositories.fullName,
  owner: repositories.owner,
  name: repositories.name,
  htmlUrl: repositories.htmlUrl,
  description: repositories.description,
  language: repositories.language,
  topics: repositories.topics,
  stars: repositories.stars,
  forks: repositories.forks,
  openIssues: repositories.openIssues,
  archived: repositories.archived,
  githubPushedAt: repositories.githubPushedAt,
  syncedAt: repositories.syncedAt,
  categoryId: repositories.categoryId,
  // The latest stored analysis, read from the database (null: not analyzed).
  latestAnalysisAt: sql<Date | string | null>`(select max(ra.created_at) from repository_analyses ra where ra.repository_id = ${outerRepositoryId})`,
  latestAnalysisVersion: sql<string | null>`(select ra.prompt_version from repository_analyses ra where ra.repository_id = ${outerRepositoryId} order by ra.created_at desc limit 1)`,
  // Whether that latest analysis is partial (a section of the AI's reply was unusable).
  latestAnalysisPartial: sql<boolean | null>`(select (ra.result -> 'unavailableSections') is not null from repository_analyses ra where ra.repository_id = ${outerRepositoryId} order by ra.created_at desc limit 1)`,
};

// "Has at least one stored analysis", for filtering lists.
const hasAnalysis = sql`exists (select 1 from repository_analyses ra where ra.repository_id = ${outerRepositoryId})`;

const categoryFor = (categoryId: string) => getCategory(categoryId) ?? getCategory(FALLBACK_CATEGORY_ID)!;

export function toRepositoryCard<
  T extends { categoryId: string; latestAnalysisAt: Date | string | null; latestAnalysisVersion: string | null; latestAnalysisPartial: boolean | null },
>({ categoryId, latestAnalysisAt, latestAnalysisVersion, latestAnalysisPartial, ...repo }: T) {
  return {
    ...repo,
    category: categoryFor(categoryId),
    // Earlier prompt versions still count as analyzed; re-analysis stays manual.
    analysis:
      latestAnalysisAt === null
        ? null
        : {
            analyzedAt: new Date(latestAnalysisAt),
            promptVersion: latestAnalysisVersion,
            current: latestAnalysisVersion === ANALYSIS_PROMPT_VERSION,
            // A partial analysis still counts as analyzed, and is labeled.
            partial: latestAnalysisPartial === true,
          },
  };
}

export const ANALYSIS_FILTERS = ["all", "analyzed", "not_analyzed"] as const;
export type AnalysisFilter = (typeof ANALYSIS_FILTERS)[number];

export type RepositoryListFilters = {
  category?: string;
  searchId?: string;
  // Stored analysis status; applies to category browsing.
  analysis?: AnalysisFilter;
  limit: number;
  offset: number;
};

// Browse cached repositories. Unavailable ones are hidden. Within a search the
// order is the search rank; otherwise most stars first.
export async function listRepositories({ category, searchId, analysis = "all", limit, offset }: RepositoryListFilters) {
  const conditions: SQL[] = [isNull(repositories.unavailableAt)];
  // Unclassified repositories default to `other`; only classified ones belong
  // to a category, matching the counts in getCategorySummary.
  if (category) conditions.push(eq(repositories.categoryId, category), isNotNull(repositories.classifiedAt));

  if (searchId) {
    const [search] = await db.select({ id: searches.id }).from(searches).where(eq(searches.id, searchId));
    if (!search) throw new AppError(404, "SEARCH_NOT_FOUND", "Search not found.");

    const where = and(eq(searchRepositories.searchId, searchId), ...conditions);
    const [rows, [{ total }]] = await Promise.all([
      db
        .select({ rank: searchRepositories.rank, ...repositoryCardColumns })
        .from(searchRepositories)
        .innerJoin(repositories, eq(searchRepositories.repositoryId, repositories.id))
        .where(where)
        .orderBy(asc(searchRepositories.rank))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(searchRepositories)
        .innerJoin(repositories, eq(searchRepositories.repositoryId, repositories.id))
        .where(where),
    ]);
    return { repositories: rows.map(toRepositoryCard), total, limit, offset };
  }

  const filter = analysis === "analyzed" ? [hasAnalysis] : analysis === "not_analyzed" ? [sql`not ${hasAnalysis}`] : [];
  const where = and(...conditions, ...filter);
  const [rows, [{ total }], [counts]] = await Promise.all([
    db
      .select(repositoryCardColumns)
      .from(repositories)
      .where(where)
      .orderBy(desc(repositories.stars), asc(repositories.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(repositories).where(where),
    // How many in this scope are analyzed or not, for the filter chips.
    db
      .select({ all: count(), analyzed: sql<number>`count(*) filter (where ${hasAnalysis})`.mapWith(Number) })
      .from(repositories)
      .where(and(...conditions)),
  ]);
  return {
    repositories: rows.map(toRepositoryCard),
    total,
    limit,
    offset,
    analysis,
    counts: { all: counts.all, analyzed: counts.analyzed, notAnalyzed: counts.all - counts.analyzed },
  };
}

// Categories that currently hold at least one classified, available
// repository, in categories.json order. `other` is left out. Computed on each
// request, so a category appears or disappears with its repositories.
export async function getCategorySummary() {
  const rows = await db
    .select({ categoryId: repositories.categoryId, repositoryCount: count() })
    .from(repositories)
    .where(and(isNull(repositories.unavailableAt), isNotNull(repositories.classifiedAt)))
    .groupBy(repositories.categoryId);

  const counts = new Map(rows.map((row) => [row.categoryId, row.repositoryCount]));
  return categories
    .filter((category) => category.id !== FALLBACK_CATEGORY_ID && (counts.get(category.id) ?? 0) > 0)
    .map((category) => ({ ...category, repositoryCount: counts.get(category.id)! }));
}

// Conditional request with the stored ETag: a 304 only bumps `synced_at`.
// Returns false when GitHub reports the repository gone; it is then hidden.
async function refreshRepository(id: string, githubId: number, etag: string | null): Promise<boolean> {
  const result = await getRepository(githubId, etag);
  const now = new Date();

  if (result.status === "unavailable") {
    await db.update(repositories).set({ unavailableAt: now, updatedAt: now }).where(eq(repositories.id, id));
    return false;
  }

  let values: Partial<typeof repositories.$inferInsert> = { syncedAt: now, updatedAt: now };
  if (result.status === "ok") {
    // The GitHub ID never changes, so it is not rewritten.
    const { githubId: _unchanged, ...metadata } = result.repository;
    values = { ...values, ...metadata, etag: result.etag };
  }
  await db.update(repositories).set(values).where(eq(repositories.id, id));
  return true;
}

export async function getRepositoryDetail(id: string) {
  const [cached] = await db
    .select({
      githubId: repositories.githubId,
      etag: repositories.etag,
      syncedAt: repositories.syncedAt,
      unavailableAt: repositories.unavailableAt,
    })
    .from(repositories)
    .where(eq(repositories.id, id));
  if (!cached || cached.unavailableAt) {
    throw new AppError(404, "REPOSITORY_NOT_FOUND", "Repository not found.");
  }

  // Set when a stale repository could not be refreshed; cached data is served.
  let refreshWarning: string | null = null;
  if (Date.now() - cached.syncedAt.getTime() > STALE_AFTER_MS) {
    let available = true;
    try {
      available = await refreshRepository(id, cached.githubId, cached.etag);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      refreshWarning = error.code;
    }
    if (!available) {
      throw new AppError(404, "REPOSITORY_UNAVAILABLE", "This repository is no longer available on GitHub.");
    }
  }

  const [repo] = await db
    .select({
      ...repositoryCardColumns,
      githubUpdatedAt: repositories.githubUpdatedAt,
      readmeUrl: repositories.readmeUrl,
      hasReadme: hasStoredReadme,
      readmeFetchedAt: repositories.readmeFetchedAt,
      categoryMethod: repositories.categoryMethod,
      categoryConfidence: repositories.categoryConfidence,
      categoryReason: repositories.categoryReason,
      classifiedAt: repositories.classifiedAt,
    })
    .from(repositories)
    .where(eq(repositories.id, id));

  const { categoryMethod, categoryConfidence, categoryReason, classifiedAt, ...rest } = repo;
  return {
    ...toRepositoryCard(rest),
    classification: {
      method: categoryMethod,
      confidence: categoryConfidence,
      reason: categoryReason,
      classifiedAt,
    },
    refreshWarning,
  };
}
