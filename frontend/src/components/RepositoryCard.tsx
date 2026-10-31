import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import type { AnalysisProgress, AutoAnalysis, RepositoryCard as Repository } from "../api/types";
import { useAnalysisProgress } from "../hooks/useAnalysisProgress";
import { useAnalysisRun } from "../hooks/useAnalysisRun";
import { usePrefersReducedMotion } from "../hooks/useRevealOnce";
import { stageShort } from "../utils/analysisStages";
import { cardAnalysisStatus, type CardAnalysisStatus } from "../utils/analysisStatus";
import { categoryChipSx } from "../utils/categoryColor";
import { formatCount, timeAgo } from "../utils/time";
import { ForkIcon, IssueIcon, OpenInNewIcon, StarIcon } from "./icons";
import Reveal from "./Reveal";

type Props = {
  repository: Repository;
  index: number;
  onOpen: (repository: Repository) => void;
  // Search results: the numbered badge shows the relevance rank (1 = closest match).
  showRank?: boolean;
  // The search's automatic analysis, if any.
  autoAnalysis?: AutoAnalysis | null;
};

export default function RepositoryCard({ repository: repo, index, onOpen, showRank = false, autoAnalysis = null }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const run = useAnalysisRun(repo.id);
  const status = cardAnalysisStatus(repo, run, autoAnalysis);
  // The backend's current stage, polled only while this repository is being analyzed.
  const progress = useAnalysisProgress(repo.id, status.kind === "running");

  return (
    // Reveal (opacity/transform with delay) is kept apart from hover so hover never waits.
    <Reveal index={index} durationMs={450} staggerMs={60} maxStaggerSteps={8}>
      <Card
        component="article"
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          transition: "box-shadow 200ms ease, transform 200ms ease",
          "&:hover, &:focus-within": {
            boxShadow: 6,
            transform: reducedMotion ? "none" : "translateY(-3px)",
          },
        }}
      >
        <CardContent sx={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
            {showRank && repo.rank !== undefined && <RankBadge rank={repo.rank} />}
            <Chip size="small" label={repo.category.name} sx={categoryChipSx(repo.category.id)} />
            {repo.archived && (
              <Tooltip title="Read-only on GitHub; no longer maintained.">
                <Chip size="small" label="Archived" color="warning" variant="outlined" />
              </Tooltip>
            )}
          </Stack>

          <Link
            href={repo.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
            variant="h6"
            sx={{ fontSize: "1.05rem", wordBreak: "break-word", display: "inline-flex", alignItems: "center", gap: 0.5 }}
          >
            {repo.fullName}
            <OpenInNewIcon sx={{ fontSize: 16 }} aria-label="(opens GitHub)" />
          </Link>

          <Typography
            variant="body2"
            color={repo.description ? "text.secondary" : "text.disabled"}
            sx={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
          >
            {repo.description ?? "No description provided."}
          </Typography>

          {repo.topics.length > 0 && (
            <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
              {repo.topics.slice(0, 4).map((topic) => (
                <Chip key={topic} label={topic} size="small" variant="outlined" sx={{ fontSize: 12 }} />
              ))}
            </Stack>
          )}

          <Stack
            direction="row"
            spacing={2}
            useFlexGap
            sx={{ mt: "auto", flexWrap: "wrap", alignItems: "center", color: "text.secondary" }}
          >
            {repo.language && <Typography variant="body2">{repo.language}</Typography>}
            <Stat icon={<StarIcon sx={{ fontSize: 16 }} />} value={repo.stars} label="stars" />
            <Stat icon={<ForkIcon sx={{ fontSize: 16 }} />} value={repo.forks} label="forks" />
            <Stat icon={<IssueIcon sx={{ fontSize: 16 }} />} value={repo.openIssues} label="open issues and pull requests" />
          </Stack>

          <Typography variant="caption" color="text.secondary">
            Synced {timeAgo(repo.syncedAt)}
          </Typography>

          <AnalysisStatusLine status={status} progress={progress} />
        </CardContent>
        <CardActions sx={{ px: 2, pb: 2, pt: 0, gap: 1, flexWrap: "wrap" }} disableSpacing>
          {/* Through the shared run store: one request per repository, and
              disabled while one runs (manual or automatic). */}
          <Button
            size="small"
            variant={status.kind === "analyzed" ? "outlined" : "contained"}
            onClick={run.analyze}
            disabled={status.kind === "running"}
          >
            {status.kind === "running" ? "Analyzing…" : status.kind === "analyzed" ? "Re-analyze" : "Analyze"}
          </Button>
          <Button size="small" variant={status.kind === "analyzed" ? "contained" : "outlined"} onClick={() => onOpen(repo)}>
            Details
          </Button>
        </CardActions>
      </Card>
    </Reveal>
  );
}

function Stat({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <Tooltip title={`${value.toLocaleString()} ${label}`}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }} aria-label={`${value} ${label}`}>
        {icon}
        <Typography variant="body2">{formatCount(value)}</Typography>
      </Stack>
    </Tooltip>
  );
}

// A numbered square: the repository's place in the relevance ranking, not GitHub's order.
function RankBadge({ rank }: { rank: number }) {
  return (
    <Tooltip title={rank === 1 ? "Closest match to your idea" : `#${rank} closest match to your idea`}>
      <Box
        aria-label={`Relevance rank ${rank}`}
        sx={{
          width: 28,
          height: 28,
          borderRadius: 1,
          display: "grid",
          placeItems: "center",
          bgcolor: "primary.main",
          color: "primary.contrastText",
          fontWeight: 700,
          fontSize: 14,
          flexShrink: 0,
        }}
      >
        {rank}
      </Box>
    </Tooltip>
  );
}

function AnalysisStatusLine({ status, progress }: { status: CardAnalysisStatus; progress: AnalysisProgress | null }) {
  // Stages as the backend reported them; none is assumed.
  const stage = progress?.outcome === "running" && progress.stage ? ` · ${stageShort(progress.stage)}` : "";
  const failedAt = progress?.outcome === "failed" && progress.failedStage ? ` (while ${stageShort(progress.failedStage)})` : "";
  return (
    <Box role="status" aria-live="polite">
      {status.kind === "none" && <Chip size="small" variant="outlined" label="Not analyzed" sx={{ color: "text.secondary" }} />}
      {status.kind === "running" && (
        <Chip size="small" color="info" label={`${status.automatic ? "Analyzing automatically" : "Analyzing"}${stage}…`} />
      )}
      {status.kind === "analyzed" && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
          {status.partial ? (
            <Tooltip title="Part of the AI's answer could not be used, so one section is unavailable. Re-analyze to try for a complete analysis.">
              <Chip size="small" color="warning" label="Analyzed (partial)" />
            </Tooltip>
          ) : (
            <Chip size="small" color="success" label="Analyzed" />
          )}
          <Typography variant="caption" color="text.secondary">
            {timeAgo(status.analyzedAt)}
          </Typography>
          {!status.current && (
            <Tooltip title="Made with an earlier version of the analysis. Re-analyze to use the current version.">
              <Chip size="small" variant="outlined" label="Analyzed with an earlier version" />
            </Tooltip>
          )}
          {status.rerunError && (
            <Typography variant="body2" color="error" sx={{ width: "100%" }}>
              Re-analysis failed{failedAt}: {status.rerunError.message}
              {status.rerunError.noAiCall && " No AI request was made."}
              {" The saved analysis is still shown."}
            </Typography>
          )}
        </Stack>
      )}
      {status.kind === "failed" && (
        <Typography variant="body2" color="error">
          Analysis failed{failedAt}: {status.message}
          {status.noAiCall && " No AI request was made."}
        </Typography>
      )}
    </Box>
  );
}
