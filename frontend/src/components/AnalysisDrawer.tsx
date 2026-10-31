import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import Fade from "@mui/material/Fade";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ApiError, AutoAnalysis, RepositoryCard, RepositoryDetail } from "../api/types";
import { useRepositoryAnalysis } from "../hooks/useRepositoryAnalysis";
import { useAnalysisProgress } from "../hooks/useAnalysisProgress";
import { SECTION_NAMES, UNAVAILABLE_REASONS } from "../utils/analysisStages";
import { describeAnalysisError } from "../utils/analysisStatus";
import AnalysisProgressSteps from "./AnalysisProgressSteps";
import { categoryChipSx } from "../utils/categoryColor";
import { timeAgo } from "../utils/time";
import AnalysisResultView from "./AnalysisResultView";
import { CloseIcon, OpenInNewIcon } from "./icons";

type Props = {
  repository: RepositoryCard | null;
  open: boolean;
  onClose: () => void;
  // The current search's automatic analysis, if any.
  autoAnalysis?: AutoAnalysis | null;
};

export default function AnalysisDrawer({ repository, open, onClose, autoAnalysis = null }: Props) {
  const entry = repository && autoAnalysis?.repository?.repositoryId === repository.id ? autoAnalysis.repository : null;
  const autoRunning = entry !== null && autoAnalysis?.status === "processing";
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: "100vw", sm: 560 } }, "aria-labelledby": "analysis-title" } }}
    >
      {/* Keyed so each repository starts with fresh state, and reloads when its automatic analysis ends. */}
      {repository && (
        <DrawerContent
          key={`${repository.id}|${entry?.status ?? ""}`}
          card={repository}
          autoRunning={autoRunning}
          onClose={onClose}
        />
      )}
    </Drawer>
  );
}

const METHOD_TEXT: Record<string, string> = {
  ai: "Categorized by AI",
  topic_match: "Categorized by a GitHub topic",
  fallback: "No matching category found",
};

const REFRESH_TEXT: Record<string, string> = {
  GITHUB_RATE_LIMITED: "GitHub's rate limit was reached",
  GITHUB_UNAVAILABLE: "GitHub could not be reached",
  GITHUB_ERROR: "GitHub returned an unexpected response",
};

function DrawerContent({ card, autoRunning, onClose }: { card: RepositoryCard; autoRunning: boolean; onClose: () => void }) {
  const { detail, analysis, unchanged, loading, loadError, running, analyzeError, analyze } = useRepositoryAnalysis(card.id);
  // Real backend stages, polled only while an analysis runs (no AI request).
  const progress = useAnalysisProgress(card.id, running || autoRunning);
  const unavailable = analysis?.result.version === 3 ? (analysis.result.unavailableSections ?? []) : [];
  // Prefer freshly synced detail; the card is shown until it arrives.
  const repo: RepositoryCard | RepositoryDetail = detail ?? card;
  const pushedAt = detail?.githubPushedAt ?? null;
  const hasNewCommits = analysis
    ? pushedAt
      ? new Date(pushedAt) > new Date(analysis.createdAt)
      : analysis.hasNewCommits
    : false;

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, display: "flex", flexDirection: "column", gap: 2 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Link
            id="analysis-title"
            href={repo.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="h6"
            underline="hover"
            sx={{ wordBreak: "break-word", display: "inline-flex", alignItems: "center", gap: 0.5 }}
          >
            {repo.fullName}
            <OpenInNewIcon sx={{ fontSize: 18 }} aria-label="(opens GitHub)" />
          </Link>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {repo.description ?? "No description provided."}
          </Typography>
        </Box>
        <IconButton aria-label="Close" onClick={onClose} edge="end">
          <CloseIcon />
        </IconButton>
      </Stack>

      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
        <Chip size="small" label={repo.category.name} sx={categoryChipSx(repo.category.id)} />
        {repo.archived && <Chip size="small" label="Archived" color="warning" variant="outlined" />}
        {detail?.classification.method && (
          <Typography variant="caption" color="text.secondary">
            {METHOD_TEXT[detail.classification.method]}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
          Synced {timeAgo(repo.syncedAt)}
        </Typography>
      </Stack>

      {detail?.refreshWarning && (
        <Alert severity="warning" variant="outlined">
          Showing saved data: {REFRESH_TEXT[detail.refreshWarning] ?? "GitHub could not be refreshed"}.
        </Alert>
      )}

      <Divider />

      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }} useFlexGap>
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          Analysis
        </Typography>
        {!loading && !loadError && (
          <Button
            variant={analysis ? "outlined" : "contained"}
            onClick={analyze}
            // One request per repository: disabled while one is running (manual or automatic).
            disabled={running || autoRunning}
          >
            {running || autoRunning ? "Analyzing…" : analysis ? "Re-analyze" : "Analyze repository"}
          </Button>
        )}
      </Stack>

      {loading && (
        <Box aria-busy="true">
          <Skeleton height={28} />
          <Skeleton height={28} width="80%" />
          <Skeleton height={28} width="60%" />
        </Box>
      )}

      {loadError && <Alert severity="error">{loadError.message}</Alert>}

      {(running || autoRunning) && (
        <Alert severity="info" icon={false}>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            {autoRunning && !running && "This is the closest match to your idea, so it is being analyzed automatically. "}
            You can close this panel; the analysis keeps running.
          </Typography>
          <AnalysisProgressSteps progress={progress} />
        </Alert>
      )}

      {analyzeError && !running && (
        <>
          {/* Which stage failed, as the backend recorded it. */}
          {progress?.outcome === "failed" && <AnalysisProgressSteps progress={progress} />}
          <AnalyzeErrorAlert error={analyzeError} />
        </>
      )}

      {!loading && !loadError && !analysis && !running && !autoRunning && !analyzeError && (
        <Typography variant="body2" color="text.secondary">
          Not analyzed yet. The analysis reads this repository's README, recent issues and parts of selected source files, and lists its features,
          limitations, future project ideas and new features for its users, each linked to its evidence.
        </Typography>
      )}

      {analysis && (
        <Fade in appear timeout={300} key={analysis.id}>
          <Box>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", mb: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Analyzed {timeAgo(analysis.createdAt)}
              </Typography>
              {unavailable.length > 0 && <Chip size="small" color="warning" label="Partial analysis" />}
              {hasNewCommits && <Chip size="small" color="warning" label="Has new commits since this analysis" />}
            </Stack>
            {unavailable.length > 0 && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                <AlertTitle>Partial analysis</AlertTitle>
                {unavailable.map(({ section, reason }) => (
                  <span key={section}>
                    {SECTION_NAMES[section]} could not be processed because {UNAVAILABLE_REASONS[reason]}, so it is not shown.{" "}
                  </span>
                ))}
                Everything else passed the usual evidence and citation checks. Re-analyze to try for a complete analysis.
              </Alert>
            )}
            {unchanged && (
              <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
                The README, issues and source files read have not changed since the last analysis, so the saved result is shown.
              </Alert>
            )}
            <AnalysisResultView result={analysis.result} />
          </Box>
        </Fade>
      )}
    </Box>
  );
}

function AnalyzeErrorAlert({ error }: { error: ApiError }) {
  const { message, noAiCall } = describeAnalysisError(error);
  return (
    <Alert severity="error">
      {message}
      {noAiCall ? " No AI request was made." : " You can try again."}
    </Alert>
  );
}
