import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import type { ReactElement } from "react";
import { CodeIcon, ExploreIcon, LightbulbIcon, SchoolIcon, SearchIcon } from "../icons";
import Reveal from "../Reveal";
import LandingSection, { type LandingTone } from "./LandingSection";

const GROUPS: { icon: ReactElement; title: string; text: string; example: string }[] = [
  {
    icon: <SchoolIcon />,
    title: "Students choosing a graduation project",
    text: "See what already exists in your field, what those projects document as missing, and which gaps might become your project, with links to the evidence.",
    example: "clinic appointments",
  },
  {
    icon: <CodeIcon />,
    title: "Developers looking for something to build on",
    text: "Find related repositories, see their stars and open issues, and read the requested features and limitations before deciding where to extend or contribute.",
    example: "markdown editor",
  },
  {
    icon: <ExploreIcon />,
    title: "Beginners exploring real software",
    text: "Browse real projects grouped by domain, read a plain-language summary of what each one does, and follow the link to its code on GitHub.",
    example: "habit tracker",
  },
  {
    icon: <LightbulbIcon />,
    title: "Anyone with an idea",
    text: "Wondering whether something similar exists? Describe it in a sentence and see related projects on GitHub.",
    example: "crop tracking",
  },
];

// The example chips run a real search through the hero's form.
export default function Audience({
  onExample,
  tone = "default",
}: {
  onExample: (query: string) => void;
  tone?: LandingTone;
}) {
  return (
    <LandingSection id="who-its-for" tone={tone} title="For anyone starting something">
      <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { md: "1fr 1fr" } }}>
        {GROUPS.map((group, index) => (
          <Reveal key={group.title} index={index}>
            <Box
              component="article"
              sx={{ height: "100%", p: 3, borderRadius: 3, border: 1, borderColor: "divider", bgcolor: "background.paper", display: "flex", flexDirection: "column", gap: 1.5 }}
            >
              <Box aria-hidden sx={{ color: "primary.main", display: "flex" }}>
                {group.icon}
              </Box>
              <Typography variant="h6" component="h3">
                {group.title}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                {group.text}
              </Typography>
              <Box>
                <Chip
                  icon={<SearchIcon />}
                  label={group.example}
                  variant="outlined"
                  onClick={() => onExample(group.example)}
                  aria-label={`Search for ${group.example}`}
                />
              </Box>
            </Box>
          </Reveal>
        ))}
      </Box>
    </LandingSection>
  );
}
