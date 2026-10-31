import { AppError } from "../utils/appError.js";

// Progress of a running repository analysis, kept in memory (one server
// process, like the shared runs in repositoryAnalysisService). Each stage is
// reported by the pipeline when it really starts; nothing is estimated or
// simulated. Read by GET /api/repositories/:id/analysis/progress.

// In the order the pipeline runs them. Meta returns the whole analysis in one
// response, so there are no per-section stages.
export const ANALYSIS_STAGES = [
  "readme_issues", // README and issues from GitHub (or stored copies), scanned for secrets
  "source_files", // file list, selected source files, excerpts and the repository map
  "prepare", // fingerprint, saved-result check, prompt built and size-checked
  "meta", // the one request to Meta, until its response arrives
  "format", // the reply's JSON and shape
  "evidence", // sources, quotes, verified gaps, links between items
  "save", // stored in the database
] as const;
export type AnalysisStage = (typeof ANALYSIS_STAGES)[number];

type Outcome = "running" | "completed" | "partial" | "cached" | "failed";

type ProgressRecord = {
  startedAt: number;
  stage: AnalysisStage | null;
  stageStartedAt: number;
  completed: AnalysisStage[];
  // Stages that could not run but did not stop the analysis (source files).
  skipped: AnalysisStage[];
  outcome: Outcome;
  failedStage: AnalysisStage | null;
  errorCode: string | null;
  finishedAt: number | null;
};

export type ProgressReporter = {
  // Ends the current stage (completed) and starts `next`.
  stage: (next: AnalysisStage) => void;
  // Ends the current stage as skipped (it could not be done; the analysis continues).
  skip: () => void;
  finish: (outcome: "completed" | "partial" | "cached") => void;
  fail: (error: unknown) => void;
};

// A finished run stays readable this long, so the page can show how it ended.
const KEEP_FINISHED_MS = 2 * 60 * 1000;

const records = new Map<string, ProgressRecord>();

export const noProgress: ProgressReporter = { stage: () => {}, skip: () => {}, finish: () => {}, fail: () => {} };

export function startProgress(repositoryId: string, now: () => number = Date.now): ProgressReporter {
  const record: ProgressRecord = {
    startedAt: now(),
    stage: null,
    stageStartedAt: now(),
    completed: [],
    skipped: [],
    outcome: "running",
    failedStage: null,
    errorCode: null,
    finishedAt: null,
  };
  records.set(repositoryId, record);

  const close = (list: "completed" | "skipped") => {
    if (record.stage) record[list].push(record.stage);
    record.stage = null;
  };
  const end = (outcome: Outcome) => {
    record.outcome = outcome;
    record.finishedAt = now();
    // Removed later, unless a newer run has replaced it.
    setTimeout(() => records.get(repositoryId) === record && records.delete(repositoryId), KEEP_FINISHED_MS).unref();
  };

  return {
    stage: (next) => {
      if (record.outcome !== "running") return;
      close("completed");
      record.stage = next;
      record.stageStartedAt = now();
    },
    skip: () => {
      if (record.outcome === "running") close("skipped");
    },
    finish: (outcome) => {
      if (record.outcome !== "running") return;
      close("completed");
      end(outcome);
    },
    fail: (error) => {
      if (record.outcome !== "running") return;
      record.failedStage = record.stage;
      record.stage = null;
      record.errorCode = error instanceof AppError ? error.code : "INTERNAL_ERROR";
      end("failed");
    },
  };
}

// The current progress of a repository's analysis, or null when none ran recently.
// Elapsed times are measured on the server when the progress is read.
export function getAnalysisProgress(repositoryId: string, now: () => number = Date.now) {
  const record = records.get(repositoryId);
  if (!record) return null;
  const at = record.finishedAt ?? now();
  return {
    outcome: record.outcome,
    stage: record.stage,
    stageElapsedMs: record.stage ? at - record.stageStartedAt : null,
    totalElapsedMs: at - record.startedAt,
    completed: record.completed,
    skipped: record.skipped,
    failedStage: record.failedStage,
    errorCode: record.errorCode,
  };
}
