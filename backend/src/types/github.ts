// GitHub data mapped to the shape the app stores (see db/schema).
export type GitHubRepository = {
  githubId: number;
  fullName: string;
  owner: string;
  name: string;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  topics: string[];
  stars: number;
  forks: number;
  // GitHub counts open pull requests here too.
  openIssues: number;
  githubPushedAt: Date | null;
  githubUpdatedAt: Date | null;
  archived: boolean;
};

export type GitHubSearchResult = {
  totalCount: number;
  // True when GitHub timed out and returned only part of the matches.
  incompleteResults: boolean;
  repositories: GitHubRepository[];
};

export type RepositoryFetchResult =
  | { status: "ok"; repository: GitHubRepository; etag: string | null }
  | { status: "not_modified" }
  | { status: "unavailable" };

export type GitHubReadme = {
  content: string;
  htmlUrl: string;
};

export type GitHubTreeFile = {
  path: string;
  // Bytes, as GitHub reports them.
  size: number;
  // Blob SHA: identical content has the same SHA.
  sha: string;
};

export type GitHubTree = {
  // The default branch's head commit the listing belongs to.
  commitSha: string;
  // True when GitHub returned only part of a very large tree.
  truncated: boolean;
  files: GitHubTreeFile[];
};

export type GitHubFileContent =
  | {
      status: "ok";
      path: string;
      // The whole file, so it can be scanned before anything is cut.
      content: string;
      // Link to the file at the listed commit, so it shows what was read.
      htmlUrl: string;
    }
  // missing: gone at that commit; binary: not text; too_large: over the byte limit.
  | { status: "missing" | "binary" | "too_large"; path: string };

export type GitHubIssue = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  // Why a closed issue was closed ("not_planned": declined). Fresh from GitHub
  // only; not stored, so stored copies have none.
  stateReason?: "completed" | "not_planned" | "reopened" | null;
  htmlUrl: string;
  githubCreatedAt: Date;
  githubUpdatedAt: Date;
};
