import { z } from "zod";
import { config } from "../config.js";
import type {
  GitHubFileContent,
  GitHubIssue,
  GitHubReadme,
  GitHubTree,
  GitHubRepository,
  GitHubSearchResult,
  RepositoryFetchResult,
} from "../types/github.js";
import { AppError } from "../utils/appError.js";

const API_URL = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 10_000;
// Caps on stored text so one huge README or issue cannot bloat the DB or later prompts.
const MAX_README_CHARS = 100_000;
const MAX_ISSUE_BODY_CHARS = 10_000;
// Source files are read whole (to scan them for secrets) but never above this.
export const MAX_SOURCE_FILE_BYTES = 1_000_000;

// GitHub responses are external data: validate them before use.
const repositorySchema = z.object({
  id: z.number(),
  full_name: z.string(),
  name: z.string(),
  owner: z.object({ login: z.string() }),
  html_url: z.string(),
  description: z.string().nullable(),
  language: z.string().nullable(),
  topics: z.array(z.string()).default([]),
  stargazers_count: z.number(),
  forks_count: z.number(),
  open_issues_count: z.number(),
  pushed_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  archived: z.boolean().default(false),
});

const searchSchema = z.object({
  total_count: z.number(),
  incomplete_results: z.boolean(),
  items: z.array(repositorySchema),
});

const readmeSchema = z.object({
  content: z.string(),
  encoding: z.literal("base64"),
  html_url: z.string(),
});

const issueSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.enum(["open", "closed"]),
  state_reason: z.enum(["completed", "not_planned", "reopened"]).nullable().optional().catch(null),
  html_url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  // Present only on pull requests, which the issues endpoint also returns.
  pull_request: z.unknown().optional(),
});

const treeSchema = z.object({
  truncated: z.boolean(),
  tree: z.array(
    z.object({
      path: z.string(),
      // blob (file), tree (directory) or commit (submodule).
      type: z.string(),
      sha: z.string(),
      size: z.number().optional(),
    }),
  ),
});

// SHA-1 or SHA-256 commit IDs.
const commitShaSchema = z.string().regex(/^[0-9a-f]{40}([0-9a-f]{24})?$/);

function toDate(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

function mapRepository(data: z.infer<typeof repositorySchema>): GitHubRepository {
  return {
    githubId: data.id,
    fullName: data.full_name,
    owner: data.owner.login,
    name: data.name,
    htmlUrl: data.html_url,
    description: data.description,
    language: data.language,
    topics: data.topics,
    stars: data.stargazers_count,
    forks: data.forks_count,
    openIssues: data.open_issues_count,
    githubPushedAt: toDate(data.pushed_at),
    githubUpdatedAt: toDate(data.updated_at),
    archived: data.archived,
  };
}

function repoPath(owner: string, name: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

function isRateLimited(res: Response): boolean {
  if (res.status === 429) return true;
  return (
    res.status === 403 &&
    (res.headers.get("x-ratelimit-remaining") === "0" || res.headers.has("retry-after"))
  );
}

async function request(path: string, headers: Record<string, string> = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "MissedBuild",
        // Optional: without a token GitHub allows far fewer requests per hour.
        ...(config.github.token ? { Authorization: `Bearer ${config.github.token}` } : {}),
        ...headers,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    console.error(`GitHub request failed: ${path}`, error);
    throw new AppError(502, "GITHUB_UNAVAILABLE", "GitHub could not be reached. Please try again.");
  }

  if (isRateLimited(res)) {
    throw new AppError(429, "GITHUB_RATE_LIMITED", "GitHub rate limit reached. Please try again later.");
  }
  return res;
}

// safeParse, not parse: a ZodError here would reach the error handler as a
// client "invalid request", but the fault is GitHub's response.
async function readBody<T>(res: Response, schema: z.ZodType<T>, path: string): Promise<T> {
  if (!res.ok) {
    console.error(`GitHub returned ${res.status}: ${path}`);
    throw new AppError(502, "GITHUB_ERROR", "GitHub returned an unexpected response.");
  }
  const result = schema.safeParse(await res.json().catch(() => undefined));
  if (!result.success) {
    console.error(`Unexpected GitHub response shape: ${path}`, result.error.issues);
    throw new AppError(502, "GITHUB_ERROR", "GitHub returned an unexpected response.");
  }
  return result.data;
}

// `query` is a GitHub search string; qualifiers are built by the caller.
export async function searchRepositories(query: string, perPage = 30): Promise<GitHubSearchResult> {
  const path = `/search/repositories?${new URLSearchParams({ q: query, per_page: String(perPage) })}`;
  const data = await readBody(await request(path), searchSchema, path);
  return {
    totalCount: data.total_count,
    incompleteResults: data.incomplete_results,
    repositories: data.items.map(mapRepository),
  };
}

// Looked up by GitHub ID, which survives renames and transfers; a name can
// later belong to a different repository. With an ETag, GitHub answers 304
// when nothing changed.
export async function getRepository(githubId: number, etag?: string | null): Promise<RepositoryFetchResult> {
  const path = `/repositories/${githubId}`;
  const res = await request(path, etag ? { "If-None-Match": etag } : {});

  if (res.status === 304) return { status: "not_modified" };
  if (res.status === 404 || res.status === 410 || res.status === 451) return { status: "unavailable" };

  const data = await readBody(res, repositorySchema, path);
  return { status: "ok", repository: mapRepository(data), etag: res.headers.get("etag") };
}

// Returns null when the repository has no README.
export async function getReadme(owner: string, name: string): Promise<GitHubReadme | null> {
  const path = `${repoPath(owner, name)}/readme`;
  const res = await request(path);
  if (res.status === 404) return null;

  const data = await readBody(res, readmeSchema, path);
  return {
    content: Buffer.from(data.content, "base64").toString("utf8").slice(0, MAX_README_CHARS),
    htmlUrl: data.html_url,
  };
}

// Every file in the default branch's head commit, with sizes and blob SHAs.
// Two requests: the head commit's SHA (plain text), then the recursive tree
// at that commit, so files are later read from the same commit. GitHub may
// truncate very large trees. Null when the repository is gone or empty.
export async function getTree(owner: string, name: string): Promise<GitHubTree | null> {
  const commitPath = `${repoPath(owner, name)}/commits/HEAD`;
  const commitRes = await request(commitPath, { Accept: "application/vnd.github.sha" });
  // 404: repository is gone. 409: repository is empty.
  if (commitRes.status === 404 || commitRes.status === 409) return null;
  // A SHA is 40 or 64 characters; anything much longer is not one.
  const commitBytes = await readBytesLimited(commitRes, commitPath, 256);
  const commitSha = commitShaSchema.safeParse(commitBytes?.toString("utf8").trim());
  if (!commitSha.success) {
    console.error(`Unexpected GitHub response shape: ${commitPath}`);
    throw new AppError(502, "GITHUB_ERROR", "GitHub returned an unexpected response.");
  }

  const treePath = `${repoPath(owner, name)}/git/trees/${commitSha.data}?recursive=1`;
  const data = await readBody(await request(treePath), treeSchema, treePath);
  return {
    commitSha: commitSha.data,
    truncated: data.truncated,
    files: data.tree
      .filter((entry) => entry.type === "blob")
      .map((entry) => ({ path: entry.path, size: entry.size ?? 0, sha: entry.sha })),
  };
}

// Reads at most `maxBytes` of the body; null when it is larger. The declared
// length is checked first, and the stream is cancelled as soon as the limit
// is passed, so an oversized file is never held in memory.
async function readBytesLimited(res: Response, path: string, maxBytes: number): Promise<Buffer | null> {
  if (!res.ok) {
    console.error(`GitHub returned ${res.status}: ${path}`);
    throw new AppError(502, "GITHUB_ERROR", "GitHub returned an unexpected response.");
  }
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!res.body) return Buffer.alloc(0);

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch (error) {
    // The timeout can also fire while the body is still arriving.
    console.error(`GitHub request failed: ${path}`, error);
    throw new AppError(502, "GITHUB_UNAVAILABLE", "GitHub could not be reached. Please try again.");
  }
  return Buffer.concat(chunks);
}

// One whole file at a commit, up to `maxBytes`. The text is returned as
// data only: it is never executed or followed.
export async function getFileContent(
  owner: string,
  name: string,
  commitSha: string,
  filePath: string,
  maxBytes = MAX_SOURCE_FILE_BYTES,
): Promise<GitHubFileContent> {
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  const path = `${repoPath(owner, name)}/contents/${encodedPath}?${new URLSearchParams({ ref: commitSha })}`;
  const res = await request(path, { Accept: "application/vnd.github.raw+json" });
  if (res.status === 404) {
    await res.body?.cancel().catch(() => undefined);
    return { status: "missing", path: filePath };
  }

  const bytes = await readBytesLimited(res, path, maxBytes);
  if (!bytes) return { status: "too_large", path: filePath };
  // A NUL byte means binary content despite the file name.
  if (bytes.includes(0)) return { status: "binary", path: filePath };
  return {
    status: "ok",
    path: filePath,
    content: new TextDecoder().decode(bytes),
    htmlUrl: `https://github.com${repoPath(owner, name).replace("/repos", "")}/blob/${commitSha}/${encodedPath}`,
  };
}

// Most recently updated issues, open and closed. The endpoint mixes in pull
// requests, so one full page (GitHub's max of 100) is fetched and PRs are
// dropped; fewer than `limit` may still be returned.
export async function getIssues(owner: string, name: string, limit = 30): Promise<GitHubIssue[]> {
  const path = `${repoPath(owner, name)}/issues?${new URLSearchParams({
    state: "all",
    sort: "updated",
    direction: "desc",
    per_page: "100",
  })}`;
  const res = await request(path);
  // 410: issues are disabled for this repository. 404: repository is gone.
  if (res.status === 404 || res.status === 410) return [];

  const data = await readBody(res, z.array(issueSchema), path);
  return data
    .filter((issue) => issue.pull_request === undefined)
    .slice(0, limit)
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body?.slice(0, MAX_ISSUE_BODY_CHARS) ?? null,
      state: issue.state,
      stateReason: issue.state_reason ?? null,
      htmlUrl: issue.html_url,
      githubCreatedAt: new Date(issue.created_at),
      githubUpdatedAt: new Date(issue.updated_at),
    }));
}
