import type { AnalysisSection, AnalysisStage } from "../api/types";

// The backend's analysis stages, in the order it runs them. Meta returns the
// whole analysis in one response, so there are no per-section stages.
export const STAGES: { id: AnalysisStage; label: string; short: string; detail?: string }[] = [
  { id: "readme_issues", label: "Reading the README and issues", short: "reading the README and issues" },
  { id: "source_files", label: "Reading selected source files", short: "reading source files" },
  { id: "prepare", label: "Preparing the analysis request", short: "preparing the request" },
  {
    id: "meta",
    label: "Waiting for Meta's answer",
    short: "waiting for Meta",
    detail: "One request for the whole analysis. An attempt can take up to 90 seconds, with one retry.",
  },
  { id: "format", label: "Checking the answer's format", short: "checking the answer's format" },
  { id: "evidence", label: "Checking evidence and citations", short: "checking evidence" },
  { id: "save", label: "Saving the analysis", short: "saving" },
];

export const stageShort = (stage: AnalysisStage) => STAGES.find((s) => s.id === stage)?.short ?? stage;

// "42 s", "1 min 5 s": a server-measured duration, never estimated.
export function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

export const SECTION_NAMES: Record<AnalysisSection, string> = {
  features: "Features",
  limitations: "Limitations",
  projectIdeas: "Future project ideas",
  functionalExtensions: "Functional extensions",
  technicalImprovements: "Technical improvements",
  evidenceLimitations: "What this analysis could not see",
};

export const UNAVAILABLE_REASONS: Record<"invalid_json" | "wrong_shape" | "missing", string> = {
  invalid_json: "the AI's answer was malformed in this part",
  wrong_shape: "the AI's answer had the wrong format for this part",
  missing: "the AI's answer did not include this part",
};
