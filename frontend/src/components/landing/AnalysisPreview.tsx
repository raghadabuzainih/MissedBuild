import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { EvidenceLabel } from "../../api/types";
import { LabelChip } from "../AnalysisResultView";
import Reveal from "../Reveal";
import LandingSection, { type LandingTone } from "./LandingSection";

const PARTS: { title: string; text: string }[] = [
  { title: "Summary", text: "What the project is, who it's for and what it does, as a whole." },
  {
    title: "Future project ideas",
    text: "Up to three larger projects you could build by extending or reusing the repository: the real-world problem, who it's for, the solution, its core features, what you can reuse and what you'd still need to build.",
  },
  {
    title: "Functional extensions",
    text: "New capabilities that would help the product's users, marked as a verified gap when an open issue or the README asks for it.",
  },
  { title: "Features and limitations", text: "What it does today, and the open problems its users and maintainers report." },
  { title: "Technical improvements", text: "A short list of code quality, compatibility, testing or documentation work." },
];

// Structure only: one example label and source outline per part. No names,
// numbers, links or text from any repository.
const PREVIEW_ROWS: { title: string; label: EvidenceLabel; source: string | null }[] = [
  { title: "Summary", label: "fact", source: "README" },
  { title: "Future project ideas", label: "hypothesis", source: "Repository structure" },
  { title: "Functional extensions", label: "inference", source: "Issue" },
  { title: "Features and limitations", label: "fact", source: "File" },
  { title: "Technical improvements", label: "inference", source: null },
];

const LABEL_HELP: { label: EvidenceLabel; text: string }[] = [
  { label: "fact", text: "Stated in the README or an issue, or shown by the code, with a link to the source and, where possible, the exact quote." },
  { label: "inference", text: "Follows from the evidence but isn't stated directly." },
  { label: "hypothesis", text: "A plausible idea that the evidence doesn't directly support." },
];

const Bar = ({ width }: { width: string }) => <Skeleton variant="rounded" animation={false} height={10} width={width} sx={{ my: 0.75 }} />;

function Preview() {
  return (
    <Box
      component="figure"
      aria-label="Illustration of how an analysis is structured. Not a real repository or result."
      sx={{ m: 0, p: { xs: 2, sm: 3 }, border: 1, borderColor: "divider", borderRadius: 3, bgcolor: "background.default" }}
    >
      <Box component="figcaption" sx={{ mb: 2, p: 1.5, borderRadius: 2, bgcolor: "action.hover" }}>
        <Typography variant="body2">
          <strong>Illustration.</strong> This shows how an analysis is structured. It is not a real repository or a
          real result.
        </Typography>
      </Box>
      <Stack spacing={0} aria-hidden>
        {PREVIEW_ROWS.map((row, index) => (
          <Reveal key={row.title} index={index}>
            <Box sx={{ py: 1.5, borderBottom: index < PREVIEW_ROWS.length - 1 ? 1 : 0, borderColor: "divider" }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
                <Typography variant="overline" color="text.secondary" sx={{ flexGrow: 1, lineHeight: 1.5 }}>
                  {row.title}
                </Typography>
                <LabelChip label={row.label} />
              </Stack>
              <Bar width="92%" />
              <Bar width="64%" />
              {row.source && (
                <Box
                  component="span"
                  sx={{ display: "inline-block", mt: 0.75, px: 1, py: 0.25, border: 1, borderStyle: "dashed", borderColor: "divider", borderRadius: 1 }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {row.source}
                  </Typography>
                </Box>
              )}
            </Box>
          </Reveal>
        ))}
      </Stack>
    </Box>
  );
}

export default function AnalysisPreview({ tone = "paper" }: { tone?: LandingTone }) {
  return (
    <LandingSection
      id="what-you-get"
      tone={tone}
      title="See what a project does, and what it doesn't yet"
      intro="When you analyze a repository, MissedBuild reads its README, recent issues, a map of its files and parts of its source code, and organizes what it finds into five parts. If part of the AI's answer can't be used, the analysis is marked partial and that part is shown as unavailable, never as empty."
    >
      <Box sx={{ display: "grid", gap: { xs: 4, md: 8 }, gridTemplateColumns: { md: "1fr 1fr" }, alignItems: "start" }}>
        <Reveal distance={24}>
          <Preview />
        </Reveal>

        <Box>
          <Stack component="dl" spacing={2.5} sx={{ m: 0 }}>
            {PARTS.map((part, index) => (
              <Reveal key={part.title} index={index}>
                <Typography component="dt" variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {part.title}
                </Typography>
                <Typography component="dd" variant="body2" color="text.secondary" sx={{ m: 0 }}>
                  {part.text}
                </Typography>
              </Reveal>
            ))}
          </Stack>

          <Reveal index={PARTS.length}>
            <Box sx={{ mt: 4, p: 2.5, borderRadius: 3, border: 1, borderColor: "divider" }}>
              <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700, mb: 1.5 }}>
                Every point shows how well it's supported
              </Typography>
              <Stack spacing={1.25}>
                {LABEL_HELP.map(({ label, text }) => (
                  <Stack key={label} direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
                    <Box sx={{ flexShrink: 0, minWidth: 96 }}>
                      <LabelChip label={label} />
                    </Box>
                    <Typography variant="body2">{text}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </Reveal>
        </Box>
      </Box>
    </LandingSection>
  );
}
