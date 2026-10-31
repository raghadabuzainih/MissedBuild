import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import Pagination from "@mui/material/Pagination";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState } from "react";
import type { AnalysisFilter, RepositoryCard, RepositoryList } from "../api/types";
import { CATEGORY_PAGE_SIZE, useCategoryRepositories } from "../hooks/useCategoryRepositories";
import { categoryChipSx } from "../utils/categoryColor";
import { CategoryIcon } from "./icons";
import RepositoryGrid from "./RepositoryGrid";

const FILTER_OPTIONS: { value: AnalysisFilter; label: string; count: (counts: RepositoryList["counts"]) => number }[] = [
  { value: "all", label: "All", count: (c) => c.all },
  { value: "analyzed", label: "Analyzed", count: (c) => c.analyzed },
  { value: "not_analyzed", label: "Not analyzed", count: (c) => c.notAnalyzed },
];

const EMPTY_FILTER_TEXT: Record<AnalysisFilter, string> = {
  all: "",
  analyzed: "No repository in this category has been analyzed yet.",
  not_analyzed: "Every repository in this category has been analyzed.",
};

type Props = {
  categoryId: string;
  // By stored analysis status (any prompt version counts as analyzed).
  analysisFilter: AnalysisFilter;
  onAnalysisFilterChange: (filter: AnalysisFilter) => void;
  onOpen: (repository: RepositoryCard) => void;
  // An unknown or empty category is never shown; the page goes home instead.
  onUnavailable: () => void;
  onHome: () => void;
};

// Saved repositories in one category, 10 per page. Mount it keyed by category.
export default function CategoryBrowser({ categoryId, analysisFilter, onAnalysisFilterChange, onOpen, onUnavailable, onHome }: Props) {
  const [page, setPage] = useState(1);
  const { data, error, loading, retry } = useCategoryRepositories(categoryId, analysisFilter, page);
  const top = useRef<HTMLDivElement>(null);

  const unknown = error?.code === "INVALID_REQUEST";
  // The whole category is empty (not just the filtered list).
  const empty = data !== null && data.counts.all === 0;
  useEffect(() => {
    if (unknown || empty) onUnavailable();
  }, [unknown, empty, onUnavailable]);

  const changeFilter = (filter: AnalysisFilter) => {
    setPage(1);
    onAnalysisFilterChange(filter);
  };

  const changePage = (next: number) => {
    setPage(next);
    top.current?.scrollIntoView({ block: "start" });
  };

  // Every repository in the list shares this category; remembered while a filter shows none.
  const [category, setCategory] = useState<RepositoryCard["category"] | null>(null);
  const listed = data?.repositories[0]?.category ?? null;
  if (listed && listed.id !== category?.id) setCategory(listed);
  const pageCount = data ? Math.ceil(data.total / CATEGORY_PAGE_SIZE) : 0;

  return (
    <Box ref={top} component="section" aria-labelledby="category-title" sx={{ scrollMarginTop: { xs: 72, sm: 80 } }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center", mb: 1 }}>
        {category ? (
          <Box
            aria-hidden
            sx={[categoryChipSx(category.id), { width: 48, height: 48, borderRadius: 2, display: "grid", placeItems: "center" }]}
          >
            <CategoryIcon name={category.icon} />
          </Box>
        ) : (
          <Skeleton variant="rounded" width={48} height={48} />
        )}
        <Box>
          <Typography id="category-title" variant="h4" component="h1">
            {category ? category.name : <Skeleton width={200} />}
          </Typography>
          {data && data.counts.all > 0 && (
            <Typography variant="body2" color="text.secondary">
              {data.counts.all} {data.counts.all === 1 ? "repository" : "repositories"}
            </Typography>
          )}
        </Box>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Public GitHub repositories found by earlier MissedBuild searches. This is not a full GitHub catalog.
      </Typography>

      <Stack direction="row" spacing={1} useFlexGap role="group" aria-label="Filter by analysis status" sx={{ flexWrap: "wrap", mb: 3 }}>
        {FILTER_OPTIONS.map((option) => {
          const selected = option.value === analysisFilter;
          return (
            <Chip
              key={option.value}
              label={data ? `${option.label} (${option.count(data.counts)})` : option.label}
              color={selected ? "primary" : "default"}
              variant={selected ? "filled" : "outlined"}
              aria-pressed={selected}
              onClick={() => changeFilter(option.value)}
            />
          );
        })}
      </Stack>

      {loading && <LinearProgress sx={{ mb: 3, borderRadius: 1 }} aria-label="Loading repositories" />}

      {error && !unknown && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={retry}>
              Try again
            </Button>
          }
        >
          {error.message}
        </Alert>
      )}

      {data && !loading && data.total === 0 && data.counts.all > 0 && (
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          {EMPTY_FILTER_TEXT[analysisFilter]}
        </Typography>
      )}

      {data && data.repositories.length > 0 && (
        <>
          <RepositoryGrid repositories={data.repositories} onOpen={onOpen} />
          {pageCount > 1 && (
            <Pagination
              count={pageCount}
              page={page}
              onChange={(_event, next) => changePage(next)}
              disabled={loading}
              // The grid already ends with bottom padding.
              sx={{ display: "flex", justifyContent: "center", mt: -4, mb: 6 }}
            />
          )}
        </>
      )}

      <Box sx={{ pb: 4 }}>
        <Button onClick={onHome}>Back to home</Button>
      </Box>
    </Box>
  );
}
