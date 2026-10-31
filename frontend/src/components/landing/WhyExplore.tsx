import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactElement } from "react";
import { CodeIcon, FlagIcon, LayersIcon } from "../icons";
import Reveal from "../Reveal";
import LandingSection, { type LandingTone } from "./LandingSection";

const REASONS: { icon: ReactElement; title: string; text: string }[] = [
  {
    icon: <LayersIcon />,
    title: "Build on what exists",
    text: "Knowing what's already been done helps you focus your time on what your project adds.",
  },
  {
    icon: <CodeIcon />,
    title: "Learn from working code",
    text: "Real projects show how others structured, documented and solved a similar problem.",
  },
  {
    icon: <FlagIcon />,
    title: "Find a real gap",
    text: "Documented limitations and open issues show what users are still asking for, which is often a good place to start.",
  },
];

export default function WhyExplore({ tone = "paper" }: { tone?: LandingTone }) {
  return (
    <LandingSection id="why" tone={tone} title="Why look before you build?">
      <Box sx={{ display: "grid", gap: { xs: 4, md: 6 }, gridTemplateColumns: { md: "repeat(3, 1fr)" } }}>
        {REASONS.map((reason, index) => (
          <Reveal key={reason.title} index={index}>
            <Box aria-hidden sx={{ color: "secondary.main", display: "flex", mb: 1.5 }}>
              {reason.icon}
            </Box>
            <Typography variant="h6" component="h3" sx={{ mb: 1 }}>
              {reason.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {reason.text}
            </Typography>
          </Reveal>
        ))}
      </Box>
    </LandingSection>
  );
}
