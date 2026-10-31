import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { categoryChipSx } from "../../utils/categoryColor";
import { ArrowForwardIcon, SearchIcon } from "../icons";
import Reveal from "../Reveal";
import LandingSection from "./LandingSection";

// Three example labels for the illustration only; the real list comes from
// the backend's categories.json.
const ILLUSTRATION_CATEGORIES = [
  { id: "education", name: "Education" },
  { id: "productivity", name: "Productivity" },
  { id: "other", name: "Other" },
];

// Decorative only: outlines and placeholder bars, never repository data.
function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ height: "100%", p: 2.5, border: 1, borderColor: "divider", borderRadius: 3, bgcolor: "background.default" }}>
      <Typography variant="overline" color="text.secondary" component="p" sx={{ mb: 1.5 }}>
        {label}
      </Typography>
      {children}
    </Box>
  );
}

const Bar = ({ width }: { width: string }) => <Skeleton variant="rounded" animation={false} height={10} width={width} sx={{ my: 0.75 }} />;

function Arrow() {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", color: "text.disabled", transform: { xs: "rotate(90deg)", md: "none" } }}>
      <ArrowForwardIcon />
    </Box>
  );
}

export default function AboutSection() {
  return (
    <LandingSection id="about" tone="paper" title="From an idea to the projects that already exist">
      <Box sx={{ display: "grid", gap: { xs: 5, md: 8 }, gridTemplateColumns: { md: "1fr 1fr" }, alignItems: "center" }}>
        <Stack spacing={2} sx={{ maxWidth: 620 }}>
          <Reveal index={0}>
            <Typography>
              Many ideas have been explored before in some form, and that's useful. Existing projects show what's
              possible, what's hard, and what their users keep asking for.
            </Typography>
          </Reveal>
          <Reveal index={1}>
            <Typography>
              MissedBuild helps you find that work and understand it quickly. It searches GitHub's public repositories
              for projects related to your idea, ranks the closest ones and groups them by domain. It analyzes the
              closest match automatically, and any other repository when you ask: it reads the README, recent issues
              and parts of its code to suggest future projects and new features for its users, each linked to the
              evidence behind it.
            </Typography>
          </Reveal>
        </Stack>

        <Box aria-hidden sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { md: "1fr auto 1fr auto 1fr" } }}>
          <Reveal index={0}>
            <Panel label="Your idea">
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1.25, border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "background.paper" }}>
                <SearchIcon fontSize="small" color="action" />
                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
                  a study planner for university students
                </Typography>
              </Box>
            </Panel>
          </Reveal>
          <Arrow />
          <Reveal index={1}>
            <Panel label="Related repositories">
              <Stack spacing={1}>
                {ILLUSTRATION_CATEGORIES.map(({ id, name }) => (
                  <Box key={id} sx={{ p: 1, border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "background.paper" }}>
                    <Chip size="small" label={name} sx={[categoryChipSx(id), { height: 20, fontSize: 11 }]} />
                    <Bar width="80%" />
                  </Box>
                ))}
              </Stack>
            </Panel>
          </Reveal>
          <Arrow />
          <Reveal index={2}>
            <Panel label="Room to build">
              <Stack spacing={1.25}>
                {["Project idea", "Functional extension", "Limitation"].map((row) => (
                  <Box key={row}>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      {row}
                    </Typography>
                    <Bar width="90%" />
                  </Box>
                ))}
              </Stack>
            </Panel>
          </Reveal>
        </Box>
      </Box>
    </LandingSection>
  );
}
