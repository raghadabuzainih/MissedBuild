// Response shapes of the backend API (see backend routes and services).

// `icon` is an icon name from categories.json (see components/icons.tsx).
export type Category = { id: string; name: string; icon: string };

export type CategorySummary = Category & { repositoryCount: number };

export type RepositoryCard = {
  id: string;
  rank?: number;
  fullName: string;
  owner: string;
  name: string;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  topics: string[];
  stars: number;
  forks: number;
  openIssues: number;
  archived: boolean;
  githubPushedAt: string | null;
  syncedAt: string;
  category: Category;
  // The latest stored analysis; earlier prompt versions (current: false) still count.
  // partial: a section of the AI's reply could not be used (still counts as analyzed).
  analysis: { analyzedAt: string; promptVersion: string | null; current: boolean; partial: boolean } | null;
};

export type AnalysisFilter = "all" | "analyzed" | "not_analyzed";

export type RepositoryList = {
  repositories: RepositoryCard[];
  // Matching the analysis filter.
  total: number;
  limit: number;
  offset: number;
  analysis: AnalysisFilter;
  // The whole category, whatever the filter.
  counts: { all: number; analyzed: number; notAnalyzed: number };
};

export type SearchStatus = "processing" | "completed" | "partial" | "no_results" | "needs_clarification" | "failed";
export type SearchStage = "refining" | "searching_github" | "processing_results";

// The repository a search analyzed automatically (at most one).
export type AutoAnalysisEntry = {
  repositoryId: string;
  fullName: string;
  selectionReason: string;
  status: "pending" | "running" | "succeeded" | "failed";
  analysisId: string | null;
  // A saved analysis was shown (no AI call).
  cached: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  // true: an AI request was made; false: it failed before one; null: unknown.
  paidCallMade: boolean | null;
};

export type AutoAnalysis = {
  // no_candidates: no result had enough README or issue content (no AI call).
  status: "processing" | "completed" | "partial" | "failed" | "no_candidates";
  stage: "selecting" | "analyzing" | "comparing" | null;
  repository: AutoAnalysisEntry | null;
  error: { code: string; message: string | null } | null;
  createdAt: string;
  completedAt: string | null;
};

export type Search = {
  id: string;
  query: string;
  status: SearchStatus;
  stage: SearchStage | null;
  aiRefined: boolean;
  refinedQueries: string[];
  clarificationQuestion: string | null;
  error: { code: string; message: string | null } | null;
  warnings: string[];
  resultCount: number;
  // GitHub results left out because they did not match the idea closely enough.
  filteredCount: number;
  createdAt: string;
  completedAt: string | null;
  // Closest match first (rank 1).
  repositories: RepositoryCard[];
  // Null when the search had no results.
  autoAnalysis: AutoAnalysis | null;
};

export type RepositoryDetail = Omit<RepositoryCard, "rank"> & {
  githubUpdatedAt: string | null;
  readmeUrl: string | null;
  hasReadme: boolean;
  readmeFetchedAt: string | null;
  classification: {
    method: "ai" | "topic_match" | "fallback" | null;
    confidence: number | null;
    reason: string | null;
    classifiedAt: string | null;
  };
  // Set when stale data could not be refreshed from GitHub.
  refreshWarning: string | null;
};

export type EvidenceLabel = "fact" | "inference" | "hypothesis";

export type AnalysisSource = {
  // "structure": the repository map, linked to the file tree at the analyzed commit.
  type: "readme" | "issue" | "file" | "structure";
  url: string;
  issueNumber?: number;
  // Source files: the path, and the line where the excerpt was found.
  path?: string;
  line?: number;
  // Verbatim source text: render as plain text only.
  excerpt?: string;
};

export type Finding = { id: string; text: string; label: EvidenceLabel; sources: AnalysisSource[] };

// verified_gap: an open issue or the README states it.
export type EvidenceStatus = "verified_gap" | "needs_investigation";
export type TechnicalArea = "code_quality" | "compatibility" | "refactoring" | "testing" | "documentation";

type ResultBase = {
  summary: { text: string; label: EvidenceLabel; sources: AnalysisSource[] };
  features: Finding[];
  limitations: Finding[];
  evidenceLimitations: string[];
  // Which source files were read (analysis-v2 and later).
  sourceFiles?: SourceFilesSummary | null;
};

// analysis-v3: user value first.
// The list sections of an analysis-v3 result.
export type AnalysisSection =
  | "features"
  | "limitations"
  | "projectIdeas"
  | "functionalExtensions"
  | "technicalImprovements"
  | "evidenceLimitations";

export type AnalysisResultV3 = ResultBase & {
  // A partial analysis: a section of the AI's reply that could not be used. Absent when complete.
  unavailableSections?: { section: AnalysisSection; reason: "invalid_json" | "wrong_shape" | "missing" }[];
  // Items left out of a section because they were incomplete or duplicated.
  droppedItems?: Partial<Record<AnalysisSection, number>>;
  version: 3;
  projectIdeas: {
    id: string;
    title: string;
    problem: string;
    targetUsers: string;
    solution: string;
    coreFeatures: string[];
    reuse: { text: string; sources: AnalysisSource[] }[];
    toBuild: string[];
    complexity: "low" | "medium" | "high";
    label: "inference" | "hypothesis";
    basedOn: string[];
    sources: AnalysisSource[];
    evidenceLimitations: string;
  }[];
  functionalExtensions: (Finding & { title: string; userValue: string; evidenceStatus: EvidenceStatus; basedOn: string[] })[];
  technicalImprovements: (Finding & { title: string; area: TechnicalArea; evidenceStatus: EvidenceStatus; basedOn: string[] })[];
};

// analysis-v1/v2 results, still shown as they were.
export type LegacyAnalysisResult = ResultBase & {
  version?: undefined;
  opportunities: (Finding & {
    kind: "missing_feature" | "improvement" | "feature_request";
    title: string;
    basedOn: string[];
  })[];
  projectIdeas: {
    id: string;
    title: string;
    problem: string;
    solution: string;
    intendedUsers: string;
    coreFeatures: string[];
    complexity: "low" | "medium" | "high";
    label: "inference" | "hypothesis";
    basedOn: string[];
    sources: AnalysisSource[];
    evidenceLimitations: string;
  }[];
};

export type AnalysisResult = AnalysisResultV3 | LegacyAnalysisResult;

export type SourceFilesSummary = {
  commitSha: string;
  treeTruncated: boolean;
  files: {
    path: string;
    // Whole file, its start, its start plus declaration lines, or declaration lines only.
    excerpt: "full" | "head" | "head_outline" | "outline";
    truncated: boolean;
    redactions: number;
  }[];
};

export type Analysis = {
  id: string;
  repositoryId: string;
  createdAt: string;
  model: string;
  promptVersion: string;
  // True when unchanged evidence returned the saved result.
  cached: boolean;
  hasNewCommits: boolean;
  result: AnalysisResult;
};

// In the order the backend runs them (see backend/src/services/analysisProgress.ts).
export type AnalysisStage = "readme_issues" | "source_files" | "prepare" | "meta" | "format" | "evidence" | "save";

// A running or just-finished analysis, as the backend reports it. Elapsed
// times are measured on the server when the progress is read.
export type AnalysisProgress = {
  outcome: "running" | "completed" | "partial" | "cached" | "failed";
  stage: AnalysisStage | null;
  stageElapsedMs: number | null;
  totalElapsedMs: number;
  completed: AnalysisStage[];
  skipped: AnalysisStage[];
  failedStage: AnalysisStage | null;
  errorCode: string | null;
};

// Every backend error has this shape: `{ error: { code, message, details? } }`.
export type ApiError = {
  code: string;
  message: string;
  details?: { field: string; message: string }[];
};
