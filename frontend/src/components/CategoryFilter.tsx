import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import type { Category, RepositoryCard } from "../api/types";
import { categoryChipSx } from "../utils/categoryColor";

type Props = {
  repositories: RepositoryCard[];
  selected: string | null;
  onSelect: (categoryId: string | null) => void;
};

// Chips for the categories present in the current results, with counts
// computed here (a search has at most 10 results).
export default function CategoryFilter({ repositories, selected, onSelect }: Props) {
  const counts = new Map<string, { category: Category; count: number }>();
  for (const repo of repositories) {
    const entry = counts.get(repo.category.id) ?? { category: repo.category, count: 0 };
    entry.count += 1;
    counts.set(repo.category.id, entry);
  }
  const entries = [...counts.values()].sort(
    (a, b) => b.count - a.count || a.category.name.localeCompare(b.category.name),
  );

  return (
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      role="group"
      aria-label="Filter by category"
      sx={{ flexWrap: "wrap", mb: 3 }}
    >
      <Chip
        label={`All ${repositories.length}`}
        color={selected === null ? "primary" : "default"}
        variant={selected === null ? "filled" : "outlined"}
        onClick={() => onSelect(null)}
        aria-pressed={selected === null}
      />
      {entries.map(({ category, count }) => {
        const active = selected === category.id;
        return (
          <Chip
            key={category.id}
            label={`${category.name} ${count}`}
            onClick={() => onSelect(active ? null : category.id)}
            aria-pressed={active}
            sx={[
              categoryChipSx(category.id),
              active && ((theme) => ({ outline: `2px solid ${theme.vars?.palette.primary.main ?? theme.palette.primary.main}`, outlineOffset: 1 })),
            ]}
          />
        );
      })}
    </Stack>
  );
}
