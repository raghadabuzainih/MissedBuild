import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Container from "@mui/material/Container";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState } from "react";
import type { RepositoryCard } from "./api/types";
import AnalysisDrawer from "./components/AnalysisDrawer";
import CategoryBrowser from "./components/CategoryBrowser";
import CategoryFilter from "./components/CategoryFilter";
import LandingSections from "./components/landing/LandingSections";
import RepositoryGrid from "./components/RepositoryGrid";
import SearchHero, { type SearchHeroHandle } from "./components/SearchHero";
import AutoAnalysisNote from "./components/AutoAnalysisNote";
import SearchStatus from "./components/SearchStatus";
import { useCategoryHash } from "./hooks/useCategoryHash";
import { useCategorySummary } from "./hooks/useCategorySummary";
import { useScrollSpy } from "./hooks/useScrollSpy";
import { useSearch } from "./hooks/useSearch";
import { theme } from "./theme";

// In page order. "search" is the search box at the top of the landing page.
// Sections without a link of their own (e.g. "Why look before you build?")
// keep the previous link highlighted.
const NAV_LINKS = [
  { id: "search", label: "Start searching" },
  { id: "about", label: "About" },
  { id: "who-its-for", label: "Who it's for" },
  { id: "how-it-works", label: "How it works" },
  { id: "what-you-get", label: "What you'll get" },
  { id: "categories", label: "Categories" },
];

function App() {
  const { search, error, running, start, reset } = useSearch();
  const [category, setCategory] = useState<string | null>(null);
  // Kept after closing so the drawer keeps its content while it slides out.
  const [selected, setSelected] = useState<RepositoryCard | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hero = useRef<SearchHeroHandle>(null);
  // The sticky header: section links scroll to just below it.
  const header = useRef<HTMLElement>(null);
  const nav = useRef<HTMLElement>(null);
  // The last submitted query, for "Try again" after a failure.
  const lastQuery = useRef("");
  const { categoryId, analysisFilter, openCategory, closeCategory, setAnalysisFilter } = useCategoryHash();

  const startSearch = (query: string) => {
    lastQuery.current = query;
    setCategory(null);
    closeCategory();
    return start(query);
  };

  const openRepository = (repository: RepositoryCard) => {
    setSelected(repository);
    setDrawerOpen(true);
  };

  // Back to the landing page; not while a search is running.
  const goHome = () => {
    if (!reset()) return;
    setCategory(null);
    closeCategory();
    setDrawerOpen(false);
    window.scrollTo({ top: 0 });
  };

  const repositories = search?.repositories ?? [];
  const autoAnalysis = search?.autoAnalysis ?? null;
  // The open drawer follows the latest polled copy of its repository.
  const drawerRepository = (selected && repositories.find((repo) => repo.id === selected.id)) ?? selected;
  const visible = category ? repositories.filter((repo) => repo.category.id === category) : repositories;
  // Once a search starts, the landing sections give way to the search experience.
  const hasSearched = running || search !== null || error !== null;
  // A category opened from the landing page (#category=<id>); never during a search.
  const browsing = categoryId !== null && !running;
  const showLanding = !hasSearched && !browsing;
  const categories = useCategorySummary(showLanding);
  const navLinks = categories.length > 0 ? NAV_LINKS : NAV_LINKS.filter((link) => link.id !== "categories");
  const spy = useScrollSpy(
    navLinks.map((link) => link.id),
    header,
    showLanding,
  );

  // On narrow screens the links scroll sideways: keep the active one in view.
  useEffect(() => {
    const row = nav.current;
    const link = row?.querySelector<HTMLElement>(`[data-section="${spy.active}"]`);
    if (!row || !link || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({ left: link.offsetLeft - (row.clientWidth - link.offsetWidth) / 2, behavior: "smooth" });
  }, [spy.active]);

  const goToSection = (id: string) => {
    spy.scrollTo(id);
    // "Start searching" also puts the cursor in the search box.
    if (id === "search") hero.current?.focus();
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar ref={header} position="sticky" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar sx={{ gap: 1, flexWrap: { xs: "wrap", md: "nowrap" } }}>
          <ButtonBase
            onClick={goHome}
            disabled={running}
            aria-label="MissedBuild home"
            sx={{ borderRadius: 1, px: 0.5, mr: "auto" }}
          >
            <Typography variant="h6" component="span" sx={{ letterSpacing: "-0.01em" }}>
              Missed<Typography component="span" variant="h6" color="primary">Build</Typography>
            </Typography>
          </ButtonBase>
          {/* Section links point at landing sections, so they show only there. On
              narrow screens they form a second row that scrolls sideways. */}
          {showLanding && (
            <Box
              ref={nav}
              component="nav"
              aria-label="Landing page sections"
              sx={{
                display: "flex",
                gap: 0.5,
                order: { xs: 3, md: 0 },
                flexBasis: { xs: "100%", md: "auto" },
                overflowX: "auto",
                scrollbarWidth: "none",
                "&::-webkit-scrollbar": { display: "none" },
                mx: { xs: -2, sm: -3, md: 0 },
                px: { xs: 1, sm: 2, md: 0 },
                pb: { xs: 0.75, md: 0 },
              }}
            >
              {navLinks.map((link) => {
                const active = spy.active === link.id;
                return (
                  <Button
                    key={link.id}
                    href={`#${link.id}`}
                    data-section={link.id}
                    aria-current={active ? "location" : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      goToSection(link.id);
                    }}
                    color={active ? "primary" : "inherit"}
                    size="small"
                    sx={{
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                      position: "relative",
                      transition: "color 150ms ease",
                      // A straight underline marks the section in view (animates transform only).
                      "&::after": {
                        content: '""',
                        position: "absolute",
                        left: 8,
                        right: 8,
                        bottom: 2,
                        height: 2,
                        borderRadius: 1,
                        bgcolor: "primary.main",
                        transform: active ? "scaleX(1)" : "scaleX(0)",
                        transition: "transform 200ms ease",
                      },
                    }}
                  >
                    {link.label}
                  </Button>
                );
              })}
            </Box>
          )}
        </Toolbar>
      </AppBar>

      <Container component="main" maxWidth="lg">
        <SearchHero
          ref={hero}
          onSearch={startSearch}
          running={running}
          analyzing={running && search !== null && search.status !== "processing"}
          compact={!showLanding}
        />
        {browsing ? (
          <CategoryBrowser
            key={categoryId}
            categoryId={categoryId}
            analysisFilter={analysisFilter}
            onAnalysisFilterChange={setAnalysisFilter}
            onOpen={openRepository}
            onUnavailable={closeCategory}
            onHome={goHome}
          />
        ) : (
          <>
            <SearchStatus
              search={search}
              error={error}
              running={running}
              onRetry={() => hero.current?.searchFor(search?.query ?? lastQuery.current)}
            />
            {repositories.length > 0 && (
              <>
                <Typography variant="h4" component="h2" sx={{ mb: 0.5 }}>
                  Nearest Repositories to Your Idea
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Numbered by how closely they match your idea, closest first.
                </Typography>
                <AutoAnalysisNote
                  autoAnalysis={autoAnalysis}
                  partial={repositories.some((repo) => repo.id === autoAnalysis?.repository?.repositoryId && repo.analysis?.partial)}
                />
                <CategoryFilter repositories={repositories} selected={category} onSelect={setCategory} />
                <RepositoryGrid repositories={visible} onOpen={openRepository} ranked autoAnalysis={autoAnalysis} />
              </>
            )}
          </>
        )}
      </Container>

      {showLanding && (
        <LandingSections
          onExample={(query) => hero.current?.searchFor(query)}
          onStart={() => hero.current?.focus()}
          categories={categories}
          onSelectCategory={openCategory}
        />
      )}

      <AnalysisDrawer
        repository={drawerRepository}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        autoAnalysis={browsing ? null : autoAnalysis}
      />
    </ThemeProvider>
  );
}

export default App;
