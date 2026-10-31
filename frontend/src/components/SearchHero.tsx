import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Fade from "@mui/material/Fade";
import InputAdornment from "@mui/material/InputAdornment";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useFormik } from "formik";
import { useImperativeHandle, useRef, type Ref } from "react";
import * as yup from "yup";
import type { ApiError } from "../api/types";
import { usePrefersReducedMotion } from "../hooks/useRevealOnce";
import { ExpandMoreIcon, SearchIcon } from "./icons";

// Same rules as the backend, so most mistakes are caught before a request.
const schema = yup.object({
  query: yup
    .string()
    .trim()
    .required("Enter a search query.")
    .min(2, "The search query must be at least 2 characters.")
    .max(200, "The search query must be at most 200 characters.")
    .matches(/[\p{L}\p{N}]/u, "The search query must contain letters or numbers."),
});

const EXAMPLES = ["study planner", "crop tracking", "habit tracker", "clinic appointments"];

// Lets the header, landing sections and final call to action use this one form.
export type SearchHeroHandle = {
  focus: () => void;
  searchFor: (query: string) => void;
};

type Props = {
  // Resolves with a validation error from the backend, if any.
  onSearch: (query: string) => Promise<ApiError | null>;
  running: boolean;
  // The search is done and only its automatic analysis is still running.
  analyzing: boolean;
  compact: boolean;
  ref?: Ref<SearchHeroHandle>;
};

export default function SearchHero({ onSearch, running, analyzing, compact, ref }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);

  const formik = useFormik({
    initialValues: { query: "" },
    validationSchema: schema,
    onSubmit: async ({ query }, helpers) => {
      const error = await onSearch(query.trim());
      if (error) helpers.setFieldError("query", error.details?.[0]?.message ?? error.message);
    },
  });

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });

  const searchFor = (query: string) => {
    if (running) return;
    scrollToTop();
    void formik.setFieldValue("query", query).then(() => formik.submitForm());
  };

  useImperativeHandle(ref, () => ({
    focus: () => {
      scrollToTop();
      inputRef.current?.focus({ preventScroll: true });
    },
    searchFor,
  }));

  const showError = formik.touched.query && Boolean(formik.errors.query);

  return (
    // id "search": the navbar's "Start searching" link scrolls here.
    <Box
      component="section"
      id="search"
      aria-label="Search"
      sx={{ pt: compact ? 4 : { xs: 8, md: 12 }, pb: compact ? 4 : { xs: 8, md: 10 }, transition: "padding 300ms ease" }}
    >
      <Collapse in={!compact} timeout={300}>
        <Fade in appear timeout={700}>
          <Box>
            <Typography variant="h1" component="h1" sx={{ mb: 2, maxWidth: 820 }}>
              Your idea has probably been started. Find out where it stopped.
            </Typography>
            <Typography variant="h6" component="p" color="text.secondary" sx={{ fontWeight: 400, mb: 4, maxWidth: 680 }}>
              Find open-source projects related to your idea, explore what they offer, and discover opportunities to
              build on top of them.
            </Typography>
          </Box>
        </Fade>
      </Collapse>

      <Box
        component="form"
        noValidate
        onSubmit={formik.handleSubmit}
      >
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ alignItems: { md: "flex-start" } }}>
          <TextField
            fullWidth
            name="query"
            inputRef={inputRef}
            placeholder="e.g. a study planner for university students"
            aria-label="Search query"
            value={formik.values.query}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={showError}
            helperText={showError ? formik.errors.query : " "}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
                sx: { bgcolor: "background.paper" },
              },
              htmlInput: { maxLength: 200 },
            }}
          />
          {/* Disabled until the active search (and its automatic analysis) reaches a final status. */}
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={running || formik.isSubmitting}
            sx={{ height: 56, px: 4, flexShrink: 0 }}
          >
            {running ? (analyzing ? "Analyzing…" : "Searching…") : "Search"}
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: -1 }}>
          Shows up to 5 repositories closest to your idea. The closest one with enough content is analyzed automatically
          with AI; you can analyze the others yourself.
        </Typography>
      </Box>

      <Collapse in={!compact} timeout={300}>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
          <Typography variant="body2" color="text.secondary">
            Try:
          </Typography>
          {EXAMPLES.map((example) => (
            <Chip key={example} label={example} variant="outlined" disabled={running} onClick={() => searchFor(example)} />
          ))}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 3, maxWidth: 680 }}>
          Explore active and archived projects, review their documentation and recent issues, and discover what you
          could build next.
        </Typography>
        <Link
          href="#how-it-works"
          underline="hover"
          variant="body2"
          sx={{ mt: 3, display: "inline-flex", alignItems: "center", gap: 0.5, fontWeight: 600 }}
        >
          How it works
          <ExpandMoreIcon fontSize="small" />
        </Link>
      </Collapse>
    </Box>
  );
}
