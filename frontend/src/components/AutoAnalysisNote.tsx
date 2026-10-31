import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import type { AutoAnalysis } from "../api/types";

// One line on the search's automatic analysis: which repository, why, and how
// it went. The card itself shows the analysis status.
// `partial`: the analysis shown for that repository is partial (from its card).
export default function AutoAnalysisNote({ autoAnalysis, partial = false }: { autoAnalysis: AutoAnalysis | null; partial?: boolean }) {
  if (!autoAnalysis) return null;
  const entry = autoAnalysis.repository;

  if (autoAnalysis.status === "no_candidates") {
    return (
      <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
        {autoAnalysis.error?.message ?? "None of the repositories found has enough content to analyze. No AI request was made."} You can
        still analyze any of them yourself.
      </Alert>
    );
  }
  if (!entry) {
    if (autoAnalysis.status === "processing") return <Line>Choosing the closest match to analyze…</Line>;
    return autoAnalysis.status === "failed" ? (
      <Line>{autoAnalysis.error?.message ?? "The automatic analysis failed. You can analyze any repository yourself."}</Line>
    ) : null;
  }

  const reason = `${entry.selectionReason}.`;
  if (entry.status === "pending" || entry.status === "running") {
    return <Line>{`Analyzing ${entry.fullName} automatically. ${reason}`}</Line>;
  }
  if (entry.status === "failed") {
    return (
      <Line>{`The automatic analysis of ${entry.fullName} failed. No other repository was analyzed automatically; you can analyze any of them yourself.`}</Line>
    );
  }
  return (
    <Line>
      {(entry.cached
        ? `${entry.fullName} was already analyzed, so its saved analysis is shown and no new AI request was made. ${reason}`
        : `${entry.fullName} was analyzed automatically. ${reason}`) +
        (partial ? " The analysis is partial: one section of the AI's answer could not be used." : "")}
    </Line>
  );
}

function Line({ children }: { children: string }) {
  return (
    <Typography variant="body2" color="text.secondary" role="status" aria-live="polite" sx={{ mb: 2 }}>
      {children}
    </Typography>
  );
}
