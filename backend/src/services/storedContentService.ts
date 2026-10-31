import { desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { excluded } from "../db/excluded.js";
import { db } from "../db/index.js";
import { repositories, repositoryIssues } from "../db/schema/index.js";
import type { GitHubIssue, GitHubReadme } from "../types/github.js";

// The only module that reads or writes the stored README text
// (repositories.readme_content) and issue text (repository_issues). The stored
// copies are kept exactly as GitHub returned them; anything read here for the
// AI must go through redactReadmeAndIssues before use (AnalysisEvidence only
// accepts its output). test/contentAccess.test.ts checks that no other source
// file touches these columns.

// Every repositories column except the README text, for code that needs a
// repository row but not its content.
const { readmeContent: _readmeContent, ...repositoryColumnsWithoutContent } = getTableColumns(repositories);
export { repositoryColumnsWithoutContent };
export type RepositoryWithoutContent = Omit<typeof repositories.$inferSelect, "readmeContent">;

// Whether a README was stored, without reading it.
export const hasStoredReadme = sql<boolean>`${repositories.readmeContent} is not null`;

// Columns to set when a README fetch result is stored. A null README means
// "checked, none exists".
export function readmeFields(readme: GitHubReadme | null, fetchedAt: Date) {
  return { readmeContent: readme?.content ?? null, readmeUrl: readme?.htmlUrl ?? null, readmeFetchedAt: fetchedAt };
}

export async function saveReadme(repoId: string, readme: GitHubReadme | null): Promise<void> {
  const now = new Date();
  await db
    .update(repositories)
    .set({ ...readmeFields(readme, now), updatedAt: now })
    .where(eq(repositories.id, repoId));
}

export async function saveIssues(repoId: string, issues: GitHubIssue[]): Promise<void> {
  if (issues.length === 0) return;
  await db
    .insert(repositoryIssues)
    // stateReason is not a stored column.
    .values(issues.map(({ stateReason: _stateReason, ...issue }) => ({ ...issue, repositoryId: repoId, fetchedAt: new Date() })))
    .onConflictDoUpdate({
      target: [repositoryIssues.repositoryId, repositoryIssues.number],
      set: {
        title: excluded(repositoryIssues.title),
        body: excluded(repositoryIssues.body),
        state: excluded(repositoryIssues.state),
        htmlUrl: excluded(repositoryIssues.htmlUrl),
        githubCreatedAt: excluded(repositoryIssues.githubCreatedAt),
        githubUpdatedAt: excluded(repositoryIssues.githubUpdatedAt),
        fetchedAt: excluded(repositoryIssues.fetchedAt),
      },
    });
}

// Raw stored README; scan before any AI use.
export async function loadStoredReadme(repoId: string): Promise<{ url: string; content: string } | null> {
  const [row] = await db
    .select({ url: repositories.readmeUrl, content: repositories.readmeContent })
    .from(repositories)
    .where(eq(repositories.id, repoId));
  return row?.url && row.content ? { url: row.url, content: row.content } : null;
}

// Raw stored issues, most recently updated first; scan before any AI use.
export async function loadStoredIssues(repoId: string, limit: number) {
  return db
    .select({
      number: repositoryIssues.number,
      title: repositoryIssues.title,
      body: repositoryIssues.body,
      state: repositoryIssues.state,
      htmlUrl: repositoryIssues.htmlUrl,
    })
    .from(repositoryIssues)
    .where(eq(repositoryIssues.repositoryId, repoId))
    .orderBy(desc(repositoryIssues.githubUpdatedAt))
    .limit(limit);
}

// README state for ranking search results by relevance. The text is only
// matched against keywords locally; it is never sent anywhere from here.
// checked: false when the README was never fetched; content null when none exists.
export async function loadReadmesForRanking(repoIds: string[]): Promise<Map<string, { checked: boolean; content: string | null }>> {
  if (repoIds.length === 0) return new Map();
  const rows = await db
    .select({ id: repositories.id, content: repositories.readmeContent, fetchedAt: repositories.readmeFetchedAt })
    .from(repositories)
    .where(inArray(repositories.id, repoIds));
  return new Map(rows.map((row) => [row.id, { checked: row.fetchedAt !== null, content: row.content }]));
}

// README sizes only (no text), for choosing which repositories to analyze.
export async function loadReadmeLengths(repoIds: string[]): Promise<Map<string, number>> {
  if (repoIds.length === 0) return new Map();
  const rows = await db
    .select({ id: repositories.id, length: sql<number>`coalesce(length(${repositories.readmeContent}), 0)` })
    .from(repositories)
    .where(inArray(repositories.id, repoIds));
  return new Map(rows.map((row) => [row.id, Number(row.length)]));
}
