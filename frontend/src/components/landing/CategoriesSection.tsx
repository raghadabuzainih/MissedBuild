import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import type { CategorySummary } from "../../api/types";
import { categoryChipSx } from "../../utils/categoryColor";
import { CategoryIcon } from "../icons";
import Reveal from "../Reveal";
import LandingSection from "./LandingSection";

type Props = {
  // Only categories that currently hold saved repositories; never empty here.
  categories: CategorySummary[];
  tone: "default" | "paper";
  onSelect: (categoryId: string) => void;
};

export default function CategoriesSection({ categories, tone, onSelect }: Props) {
  return (
    <LandingSection
      id="categories"
      tone={tone}
      title="Explore by category"
      intro="Public GitHub repositories found by earlier MissedBuild searches, grouped by domain. Each category can be filtered to analyzed or not-analyzed repositories. This is not a full GitHub catalog."
    >
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 220px), 1fr))" }}>
        {categories.map((category, index) => (
          <Reveal key={category.id} index={index} distance={16}>
            <ButtonBase
              onClick={() => onSelect(category.id)}
              aria-label={`${category.name}, ${category.repositoryCount} ${category.repositoryCount === 1 ? "repository" : "repositories"}`}
              sx={{
                width: "100%",
                justifyContent: "flex-start",
                gap: 1.5,
                p: 2,
                borderRadius: 3,
                border: 1,
                borderColor: "divider",
                bgcolor: "background.paper",
                textAlign: "left",
                transition: "box-shadow 200ms ease",
                "&:hover, &.Mui-focusVisible": { boxShadow: 4 },
              }}
            >
              <Box
                aria-hidden
                sx={[
                  categoryChipSx(category.id),
                  { width: 44, height: 44, borderRadius: 2, display: "grid", placeItems: "center", flexShrink: 0 },
                ]}
              >
                <CategoryIcon name={category.icon} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" component="span" sx={{ display: "block", fontWeight: 600 }}>
                  {category.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {category.repositoryCount} {category.repositoryCount === 1 ? "repository" : "repositories"}
                </Typography>
              </Box>
            </ButtonBase>
          </Reveal>
        ))}
      </Box>
    </LandingSection>
  );
}
