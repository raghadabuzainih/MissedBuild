import Box from "@mui/material/Box";
import type { AutoAnalysis, RepositoryCard as Repository } from "../api/types";
import RepositoryCard from "./RepositoryCard";

type Props = {
  repositories: Repository[];
  onOpen: (repository: Repository) => void;
  // Search results: numbered relevance badges and the automatic analysis.
  ranked?: boolean;
  autoAnalysis?: AutoAnalysis | null;
};

export default function RepositoryGrid({ repositories, onOpen, ranked = false, autoAnalysis = null }: Props) {
  return (
    <Box
      component="section"
      aria-label="Repositories"
      sx={{
        display: "grid",
        gap: 2.5,
        gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
        pb: 8,
      }}
    >
      {repositories.map((repository, index) => (
        <RepositoryCard
          key={repository.id}
          repository={repository}
          index={index}
          onOpen={onOpen}
          showRank={ranked}
          autoAnalysis={autoAnalysis}
        />
      ))}
    </Box>
  );
}
