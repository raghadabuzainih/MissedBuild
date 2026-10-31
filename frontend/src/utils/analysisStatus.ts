import type { AnalysisResult, ApiError, AutoAnalysis, RepositoryCard } from "../api/types";
import type { AnalysisRun } from "../hooks/useAnalysisRun";

// What a card shows about a repository's analysis.
export type CardAnalysisStatus =
  | { kind: "none" }
  | { kind: "running"; automatic: boolean }
  // current: false when made with an earlier version of the analysis.
  // partial: a section of the AI's reply could not be used.
  // rerunError: a later re-analysis failed; the stored analysis still stands.
  | { kind: "analyzed"; analyzedAt: string; current: boolean; partial: boolean; rerunError?: { message: string; noAiCall: boolean } }
  // noAiCall: it failed before any AI request was made.
  | { kind: "failed"; message: string; noAiCall: boolean };

// Short reasons by error code; the AI failures are told apart.
const FAILURE_TEXT: Record<string, string> = {
  AI_ANALYSIS_FAILED: "The AI service returned an error or could not be reached.",
  AI_ANALYSIS_INVALID: "The AI's answer could not be used.",
  AI_ANALYSIS_TIMEOUT: "The AI took too long to answer.",
  INSUFFICIENT_EVIDENCE: "There is no README, issue or source content to analyze.",
  NETWORK_ERROR: "Couldn't reach MissedBuild.",
  REQUEST_TIMEOUT: "MissedBuild took too long to answer.",
};

// Raised before any AI request (evidence collection, size checks, GitHub).
const NO_AI_CALL = new Set([
  "INSUFFICIENT_EVIDENCE",
  "ANALYSIS_PROMPT_TOO_LARGE",
  "REPOSITORY_NOT_FOUND",
  "REPOSITORY_UNAVAILABLE",
  "GITHUB_RATE_LIMITED",
  "GITHUB_UNAVAILABLE",
  "GITHUB_ERROR",
  "INVALID_REQUEST",
]);

const failureText = (code: string, message: string | null) => FAILURE_TEXT[code] ?? message ?? "The analysis failed.";

// A failed analysis request, as cards and the drawer describe it.
export const describeAnalysisError = (error: ApiError) => ({
  message: failureText(error.code, error.message),
  noAiCall: NO_AI_CALL.has(error.code),
});

const fromError = (error: ApiError): CardAnalysisStatus => ({ kind: "failed", ...describeAnalysisError(error) });

// A partial analysis: at least one section of the AI's reply could not be used.
export const isPartialAnalysis = (result: AnalysisResult) =>
  result.version === 3 && (result.unavailableSections?.length ?? 0) > 0;

// `auto`: the search's automatic analysis, when it concerns this repository.
export function cardAnalysisStatus(card: RepositoryCard, run: AnalysisRun, auto: AutoAnalysis | null): CardAnalysisStatus {
  const entry = auto?.repository?.repositoryId === card.id ? auto.repository : null;
  if (run.running) return { kind: "running", automatic: false };
  if (entry && auto?.status === "processing" && (entry.status === "running" || entry.status === "pending")) {
    return { kind: "running", automatic: true };
  }
  if (run.result) return { kind: "analyzed", analyzedAt: run.result.createdAt, current: true, partial: isPartialAnalysis(run.result.result) };
  // A stored analysis keeps the repository "Analyzed", even if re-analyzing it failed.
  if (card.analysis) {
    return {
      kind: "analyzed",
      analyzedAt: card.analysis.analyzedAt,
      current: card.analysis.current,
      partial: card.analysis.partial,
      ...(run.error && { rerunError: describeAnalysisError(run.error) }),
    };
  }
  if (run.error) return fromError(run.error);
  if (entry?.status === "succeeded") {
    // The card was read just before the automatic analysis was saved.
    return { kind: "analyzed", analyzedAt: auto?.completedAt ?? new Date().toISOString(), current: true, partial: false };
  }
  if (entry?.status === "failed") {
    return {
      kind: "failed",
      message: failureText(entry.errorCode ?? "", entry.errorMessage),
      noAiCall: entry.paidCallMade === false,
    };
  }
  return { kind: "none" };
}
