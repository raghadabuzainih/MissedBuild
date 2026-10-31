import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Fade from "@mui/material/Fade";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ApiError, Search, SearchStage } from "../api/types";

// Shown only for the stage the backend reports; nothing is simulated.
const STAGE_LABELS: Record<SearchStage, string> = {
  refining: "Understanding your idea…",
  searching_github: "Searching GitHub…",
  processing_results: "Checking relevance and sorting results by domain…",
};

const WARNING_MESSAGES: Record<string, string> = {
  AI_REFINEMENT_FAILED: "AI query refinement was unavailable, so your words were searched as keywords.",
  GITHUB_INCOMPLETE_RESULTS: "GitHub returned incomplete results for this search.",
  AI_CLASSIFICATION_FAILED: "AI categorization was unavailable; categories are based on GitHub topics only.",
  README_FETCH_INCOMPLETE: "Some READMEs could not be loaded, so their categories may be less accurate.",
};

// Search failures stored by the backend, by error code.
const FAILURE_TEXT: Record<string, { title: string; message: string }> = {
  GITHUB_RATE_LIMITED: {
    title: "GitHub is limiting requests",
    message: "GitHub's search limit was reached. Wait a minute, then try again.",
  },
  GITHUB_UNAVAILABLE: {
    title: "Couldn't reach GitHub",
    message: "GitHub didn't respond in time. Please try again in a moment.",
  },
  GITHUB_ERROR: {
    title: "GitHub returned an unexpected response",
    message: "Please try again. If it keeps happening, try different words.",
  },
  SEARCH_INTERRUPTED: {
    title: "The search was interrupted",
    message: "The server restarted while your search was running. Please search again.",
  },
};
const DEFAULT_FAILURE = { title: "The search failed", message: "Something went wrong on our side. Please try again." };

// Request failures in the browser (see api/errors.ts); their messages are kept.
const CONNECTION_CODES = new Set(["NETWORK_ERROR", "REQUEST_TIMEOUT"]);

const quoted = (queries: string[]) => queries.map((query) => `“${query}”`).join(", ");

// Why nothing was found depends on how the query was searched.
function noResultsMessage(search: Search): string {
  const queries = quoted(search.refinedQueries);
  if (search.filteredCount > 0) {
    return `GitHub returned repositories for ${queries}, but none matched your idea closely enough. Try describing it differently or with the main feature in 2–4 words.`;
  }
  if (search.warnings.includes("AI_REFINEMENT_FAILED")) {
    return `AI refinement was unavailable, so we searched for your main keywords: ${queries}. Try a shorter, more general phrase.`;
  }
  if (search.aiRefined) {
    return `We searched GitHub for ${queries} based on your idea, and none matched public repositories. Try describing the core feature in 2–4 words.`;
  }
  return `GitHub found no public repositories matching all of these words: ${queries}. Try fewer words or a broader term.`;
}

type Props = {
  search: Search | null;
  error: ApiError | null;
  running: boolean;
  // Runs the same query again; offered on failures.
  onRetry: () => void;
};

export default function SearchStatus({ search, error, running, onRetry }: Props) {
  const retryAction = (
    <Button color="inherit" size="small" onClick={onRetry} disabled={running}>
      Try again
    </Button>
  );

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 3 }} action={retryAction}>
        <AlertTitle>{CONNECTION_CODES.has(error.code) ? "Couldn't reach MissedBuild" : "The search failed"}</AlertTitle>
        {error.message}
      </Alert>
    );
  }
  if (!search) {
    return running ? <Progress label="Starting search…" /> : null;
  }

  const warnings = search.warnings.map((code) =>
    code === "RESULTS_FILTERED"
      ? `${search.filteredCount} GitHub ${search.filteredCount === 1 ? "result was" : "results were"} left out because ${search.filteredCount === 1 ? "it didn't" : "they didn't"} match your idea closely enough.`
      : (WARNING_MESSAGES[code] ?? code),
  );
  const failure = search.error ? (FAILURE_TEXT[search.error.code] ?? DEFAULT_FAILURE) : DEFAULT_FAILURE;

  return (
    <Box sx={{ mb: 3 }}>
      {search.status === "processing" && <Progress label={search.stage ? STAGE_LABELS[search.stage] : "Starting search…"} />}

      {search.status === "failed" && (
        <Alert severity="error" action={retryAction}>
          <AlertTitle>{failure.title}</AlertTitle>
          {failure.message}
        </Alert>
      )}

      {search.status === "needs_clarification" && (
        <Alert severity="info">
          <AlertTitle>Tell us a bit more</AlertTitle>
          {search.clarificationQuestion} Edit your search above and try again.
        </Alert>
      )}

      {search.status === "no_results" && (
        <Alert severity="info">
          <AlertTitle>No repositories found</AlertTitle>
          {noResultsMessage(search)}
        </Alert>
      )}

      {search.status === "partial" && (
        <Alert severity="warning">
          <AlertTitle>Showing partial results</AlertTitle>
          {search.error?.message ?? "Not every part of the search could be completed."}
        </Alert>
      )}

      {(search.status === "completed" || search.status === "partial") && (
        <Typography variant="body1" sx={{ mt: search.status === "partial" ? 2 : 0 }}>
          Found <strong>{search.resultCount}</strong> relevant {search.resultCount === 1 ? "repository" : "repositories"}.
        </Typography>
      )}

      {/* The no-results message already names the queries. */}
      {search.status !== "processing" && search.status !== "no_results" && search.refinedQueries.length > 0 && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1.5, flexWrap: "wrap", alignItems: "center" }}>
          <Typography variant="body2" color="text.secondary">
            {search.aiRefined ? "AI searched GitHub for:" : "Searched GitHub for:"}
          </Typography>
          {search.refinedQueries.map((query) => (
            <Chip key={query} label={query} size="small" />
          ))}
        </Stack>
      )}

      {warnings.length > 0 && (
        <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
          {warnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </Alert>
      )}
    </Box>
  );
}

function Progress({ label }: { label: string }) {
  return (
    <Fade in appear timeout={300}>
      <Box role="status" aria-live="polite" sx={{ mb: 3 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {label}
        </Typography>
        <LinearProgress sx={{ borderRadius: 1 }} />
      </Box>
    </Fade>
  );
}
