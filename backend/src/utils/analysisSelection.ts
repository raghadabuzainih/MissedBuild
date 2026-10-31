// Which search result is analyzed automatically: the closest match (lowest
// rank) that has enough evidence for an analysis. Pure and rule-based, from
// data the search already stored; no AI and no network.

export type AnalysisCandidate = {
  repositoryId: string;
  fullName: string;
  // Position in the search results (1 = closest match to the idea).
  rank: number;
  // GitHub counts open pull requests here too.
  openIssues: number;
  // Stored README length in characters (0 when none or unknown).
  readmeLength: number;
};

// Below this, a README alone is too thin for an analysis.
const MIN_README_CHARS = 500;

export const hasEnoughEvidence = (candidate: AnalysisCandidate) => candidate.readmeLength >= MIN_README_CHARS || candidate.openIssues > 0;

// The closest match with enough evidence, and why it was chosen; null when none has enough.
export function pickForAutoAnalysis(candidates: AnalysisCandidate[]): { candidate: AnalysisCandidate; reason: string } | null {
  const ordered = [...candidates].sort((a, b) => a.rank - b.rank);
  const candidate = ordered.find(hasEnoughEvidence);
  if (!candidate) return null;
  const skipped = ordered.filter((c) => c.rank < candidate.rank).map((c) => `#${c.rank}`);
  const reason =
    skipped.length === 0
      ? "Closest match to your idea"
      : `Closest match with enough README or issue content to analyze (${skipped.join(", ")} ${skipped.length === 1 ? "has" : "have"} too little)`;
  return { candidate, reason };
}
