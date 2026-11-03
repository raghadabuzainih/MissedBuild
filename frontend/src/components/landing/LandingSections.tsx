import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import type { CategorySummary } from "../../api/types";
import Reveal from "../Reveal";
import AboutSection from "./AboutSection";
import AnalysisPreview from "./AnalysisPreview";
import Audience from "./Audience";
import CategoriesSection from "./CategoriesSection";
import HowItWorks from "./HowItWorks";
import type { LandingTone } from "./LandingSection";
import WhyExplore from "./WhyExplore";

type Props = {
  // Both go through the hero's single search form.
  onExample: (query: string) => void;
  onStart: () => void;
  // Categories with saved repositories; the section is hidden when empty.
  categories: CategorySummary[];
  onSelectCategory: (categoryId: string) => void;
};

// Everything below the hero. Shown only until a search starts.
export default function LandingSections({ onExample, onStart, categories, onSelectCategory }: Props) {
  // The categories section is optional; the sections after it flip their
  // background so the bands keep alternating either way.
  const showCategories = categories.length > 0;
  const tone = (base: LandingTone): LandingTone => (showCategories ? (base === "paper" ? "default" : "paper") : base);

  return (
    <>
      <AboutSection />
      <Audience onExample={onExample} tone={tone("default")} />
      <HowItWorks />
      <AnalysisPreview tone={tone("paper")} />
      <WhyExplore tone={tone("paper")} />
      {showCategories && <CategoriesSection categories={categories} tone="paper" onSelect={onSelectCategory} />}

      <Box
        component="section"
        aria-labelledby="final-cta-title"
        sx={{
          borderTop: 1,
          borderColor: "divider",
          bgcolor: tone("paper") === "paper" ? "background.paper" : "background.default",
          py: { xs: 10, md: 14 },
          textAlign: "center",
        }}
      >
        <Container maxWidth="md">
          <Reveal distance={24}>
            <Typography
              id="final-cta-title"
              variant="h2"
              sx={{ fontSize: "clamp(1.8rem, 2.5vw + 1rem, 2.8rem)", fontWeight: 800, letterSpacing: "-0.01em", mb: 2 }}
            >
              Have an idea?
            </Typography>
            <Typography variant="h6" component="p" color="text.secondary" sx={{ fontWeight: 400, mb: 4 }}>
              You don't need a full plan, just a direction. See what already exists, then decide what to build.
            </Typography>
            <Button variant="contained" size="large" onClick={onStart} sx={{ px: 5, height: 52 }}>
              Start searching
            </Button>
          </Reveal>
        </Container>
      </Box>

      <Box component="footer" sx={{ borderTop: 1, borderColor: "divider", py: 3 }}>
        <Container maxWidth="lg">
          <Typography variant="caption" color="text.secondary">
            Repository data comes from GitHub's public API. MissedBuild is not affiliated with GitHub.
          </Typography>
        </Container>
      </Box>
    </>
  );
}
