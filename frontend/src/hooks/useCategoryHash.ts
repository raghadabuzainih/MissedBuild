import { useCallback, useEffect, useState } from "react";
import type { AnalysisFilter } from "../api/types";

const PREFIX = "#category=";
// The fallback category is not browsable (it is hidden from the landing page).
const HIDDEN_CATEGORY = "other";
const FILTERS: readonly AnalysisFilter[] = ["all", "analyzed", "not_analyzed"];

type HashState = { categoryId: string | null; analysisFilter: AnalysisFilter };

// `#category=<id>` with an optional `&analysis=<filter>`. Other hashes (section
// anchors) are ignored; categoryId is null for a malformed or hidden category.
function readHash(): HashState {
  const { hash } = window.location;
  if (!hash.startsWith(PREFIX)) return { categoryId: null, analysisFilter: "all" };
  const [id, ...rest] = hash.slice(PREFIX.length).split("&");
  const filter = rest.find((part) => part.startsWith("analysis="))?.slice("analysis=".length);
  return {
    categoryId: /^[a-z0-9-]+$/.test(id) && id !== HIDDEN_CATEGORY ? id : null,
    analysisFilter: FILTERS.find((f) => f === filter) ?? "all",
  };
}

const hashFor = (id: string, filter: AnalysisFilter) => `category=${id}${filter === "all" ? "" : `&analysis=${filter}`}`;

// Replaces the hash without adding a history entry.
function replaceHash(hash: string) {
  history.replaceState(null, "", window.location.pathname + window.location.search + hash);
}

// The open category and its analysis filter live in the URL hash, so browser
// Back closes the category (filter changes add no history entries).
export function useCategoryHash() {
  const [state, setState] = useState<HashState>(readHash);

  useEffect(() => {
    // A malformed or hidden category hash is dropped, on load and on change.
    const dropInvalid = () => {
      if (window.location.hash.startsWith(PREFIX) && !readHash().categoryId) replaceHash("");
    };
    dropInvalid();
    const onChange = () => {
      dropInvalid();
      setState(readHash());
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  // Adds a history entry; hashchange then updates the state.
  const openCategory = useCallback((id: string) => {
    window.location.hash = hashFor(id, "all");
    window.scrollTo({ top: 0 });
  }, []);

  const closeCategory = useCallback(() => {
    if (window.location.hash.startsWith(PREFIX)) replaceHash("");
    setState({ categoryId: null, analysisFilter: "all" });
  }, []);

  const setAnalysisFilter = useCallback((filter: AnalysisFilter) => {
    const { categoryId } = readHash();
    if (!categoryId) return;
    replaceHash(`#${hashFor(categoryId, filter)}`);
    setState({ categoryId, analysisFilter: filter });
  }, []);

  return { ...state, openCategory, closeCategory, setAnalysisFilter };
}
