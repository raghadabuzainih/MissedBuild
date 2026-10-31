import type { Theme } from "@mui/material/styles";

// Colours are derived from the category ID, so there is no colour list to
// keep in sync with categories.json.
function hueFromId(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

// Chip styles for light and dark schemes; "other" stays neutral. Returns an
// sx function, so it can also be one entry of an sx array.
export function categoryChipSx(id: string) {
  const neutral = id === "other";
  const h = hueFromId(id);
  const s = neutral ? 0 : 1;
  return (theme: Theme) => ({
    bgcolor: `hsl(${h} ${70 * s}% 93%)`,
    color: `hsl(${h} ${60 * s}% 28%)`,
    border: `1px solid hsl(${h} ${50 * s}% 80%)`,
    ...theme.applyStyles("dark", {
      bgcolor: `hsl(${h} ${40 * s}% 20%)`,
      color: `hsl(${h} ${70 * s}% 82%)`,
      borderColor: `hsl(${h} ${40 * s}% 32%)`,
    }),
  });
}
