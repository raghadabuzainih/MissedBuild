import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import Reveal from "../Reveal";

export type LandingTone = "default" | "paper";

type Props = {
  id: string;
  title: string;
  intro?: ReactNode;
  // Sections alternate backgrounds for rhythm.
  tone: LandingTone;
  children: ReactNode;
};

// A full-width landing band: the heading block fades up as one unit, and each
// section staggers its own items with <Reveal index={…}>.
export default function LandingSection({ id, title, intro, tone, children }: Props) {
  return (
    <Box
      component="section"
      id={id}
      aria-labelledby={`${id}-title`}
      sx={{
        bgcolor: tone === "paper" ? "background.paper" : "background.default",
        borderTop: 1,
        borderColor: "divider",
        py: { xs: 8, md: 12 },
        // Anchor links land below the sticky header (with its row of section links below md).
        scrollMarginTop: { xs: 100, sm: 108, md: 64 },
      }}
    >
      <Container maxWidth="lg">
        <Reveal distance={24}>
          <Typography
            id={`${id}-title`}
            variant="h2"
            sx={{ fontSize: "clamp(1.6rem, 2vw + 1rem, 2.4rem)", fontWeight: 800, letterSpacing: "-0.01em", mb: 2, maxWidth: 760 }}
          >
            {title}
          </Typography>
          {intro && (
            <Typography variant="h6" component="p" color="text.secondary" sx={{ fontWeight: 400, maxWidth: 680, mb: { xs: 4, md: 6 } }}>
              {intro}
            </Typography>
          )}
        </Reveal>
        <Box sx={{ mt: intro ? 0 : { xs: 4, md: 6 } }}>{children}</Box>
      </Container>
    </Box>
  );
}
