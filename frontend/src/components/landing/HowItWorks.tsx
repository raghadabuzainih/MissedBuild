import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import type { ReactElement } from "react";
import { DocumentIcon, ExpandMoreIcon, LightbulbIcon, SearchIcon, TagIcon } from "../icons";
import Reveal from "../Reveal";
import LandingSection from "./LandingSection";

const STEPS: { icon: ReactElement; title: string; text: string }[] = [
  {
    icon: <LightbulbIcon />,
    title: "Describe your idea",
    text: "A few keywords or a full sentence both work. Short searches go straight to GitHub. Longer descriptions are turned into focused GitHub searches by AI, and if an idea is too unclear to search, you'll be asked one clarifying question.",
  },
  {
    icon: <SearchIcon />,
    title: "We search GitHub",
    text: "MissedBuild shows up to 5 public repositories that match your idea (fewer when fewer are relevant), numbered from the closest match, and shows their stars, forks, open issues, language and how recently they were synced. Archived projects are clearly marked. You'll see each stage of the search while it runs.",
  },
  {
    icon: <TagIcon />,
    title: "Results are sorted by domain",
    text: "Each repository is assigned to a category, such as Education, Healthcare, Developer Tools, and more, so you can easily filter the results. If a project doesn't clearly fit any category, it's labeled Other instead of being guessed.",
  },
  {
    icon: <DocumentIcon />,
    title: "Analyze any repository",
    text: "The closest match is analyzed automatically; use Analyze or Re-analyze on any other card. An analysis reads the README, up to 20 open and 10 closed issues, a map of the files and parts of selected source files, and suggests future project ideas and new features for its users, along with current features and limitations, each linked to its source. You'll see each step while it runs, and every card shows whether the repository is analyzed.",
  },
];

export default function HowItWorks() {
  return (
    <LandingSection id="how-it-works" tone="default" title="How it works">
      <Box component="ol" sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gap: 3, gridTemplateColumns: { sm: "1fr 1fr", lg: "repeat(4, 1fr)" } }}>
        {STEPS.map((step, index) => (
          <Box component="li" key={step.title}>
            <Reveal index={index}>
              <Box sx={{ height: "100%", p: 3, borderRadius: 3, border: 1, borderColor: "divider", bgcolor: "background.paper" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
                  <Box
                    aria-hidden
                    sx={{ width: 40, height: 40, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: "primary.main", color: "primary.contrastText" }}
                  >
                    {step.icon}
                  </Box>
                  <Typography variant="overline" color="text.secondary">
                    Step {index + 1}
                  </Typography>
                </Box>
                <Typography variant="h6" component="h3" sx={{ mb: 1 }}>
                  {step.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {step.text}
                </Typography>
              </Box>
            </Reveal>
          </Box>
        ))}
      </Box>
      <Link
        href="#what-you-get"
        underline="hover"
        variant="body2"
        sx={{ mt: 4, display: "inline-flex", alignItems: "center", gap: 0.5, fontWeight: 600 }}
      >
        Here's how an analysis is organized
        <ExpandMoreIcon fontSize="small" />
      </Link>
    </LandingSection>
  );
}
