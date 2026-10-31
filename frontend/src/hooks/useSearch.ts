import { useCallback, useEffect, useRef, useState } from "react";
import { toApiError } from "../api/errors";
import { createSearch, getSearch } from "../api/searches";
import type { ApiError, Search } from "../api/types";

const POLL_INTERVAL_MS = 1_000;
// Consecutive failed polls before giving up (a single blip is retried).
const MAX_POLL_FAILURES = 3;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Final when the search is, and also its automatic analysis of the closest match.
const isFinal = (search: Search) => search.status !== "processing" && search.autoAnalysis?.status !== "processing";

// Starts a search and polls it until the backend reports a final status.
// Only one search runs at a time: another cannot start until this one ends.
export function useSearch() {
  const [search, setSearch] = useState<Search | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [running, setRunning] = useState(false);
  // Identifies the current run; polling stops when this changes (unmount).
  const runId = useRef(0);
  // A ref, not state, so a second submit in the same tick is also refused.
  const active = useRef(false);

  useEffect(() => () => void runId.current++, []);

  // Creates the search, then polls until final. Returns validation errors to
  // the caller; every other error goes to `error`.
  const start = useCallback(async (query: string): Promise<ApiError | null> => {
    if (active.current) return null;
    active.current = true;
    const run = ++runId.current;
    const isCurrent = () => run === runId.current;
    setRunning(true);
    setError(null);
    setSearch(null);

    try {
      const { id } = await createSearch(query);
      let failures = 0;
      while (isCurrent()) {
        try {
          const latest = await getSearch(id);
          if (!isCurrent()) break;
          setSearch(latest);
          failures = 0;
          if (isFinal(latest)) break;
        } catch (pollError) {
          if (++failures >= MAX_POLL_FAILURES) throw pollError;
        }
        await wait(POLL_INTERVAL_MS);
      }
      return null;
    } catch (requestError) {
      const apiError = toApiError(requestError);
      if (!isCurrent()) return null;
      if (apiError.code === "INVALID_REQUEST") return apiError;
      setError(apiError);
      return null;
    } finally {
      active.current = false;
      if (isCurrent()) setRunning(false);
    }
  }, []);

  // Back to the landing page. Refused while a search runs (one search at a time).
  const reset = useCallback((): boolean => {
    if (active.current) return false;
    runId.current++;
    setSearch(null);
    setError(null);
    return true;
  }, []);

  return { search, error, running, start, reset };
}
