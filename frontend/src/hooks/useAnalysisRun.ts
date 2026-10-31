import { useCallback, useSyncExternalStore } from "react";
import { toApiError } from "../api/errors";
import { analyzeRepository } from "../api/repositories";
import type { Analysis, ApiError } from "../api/types";
import { clearAnalysisProgress } from "./useAnalysisProgress";

// Analysis requests started in this tab, per repository. Module-level and
// shared, so a card and the drawer show the same run, closing the drawer does
// not lose it, and a second request is never sent while one is running.
export type AnalysisRun = {
  running: boolean;
  // The last finished request: its result or its error.
  result: Analysis | null;
  error: ApiError | null;
};

const IDLE: AnalysisRun = { running: false, result: null, error: null };
const runs = new Map<string, AnalysisRun>();
const listeners = new Set<() => void>();

function update(repositoryId: string, run: AnalysisRun) {
  runs.set(repositoryId, run);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function startAnalysis(repositoryId: string): void {
  const current = runs.get(repositoryId) ?? IDLE;
  if (current.running) return;
  clearAnalysisProgress(repositoryId);
  update(repositoryId, { ...current, running: true, error: null });
  analyzeRepository(repositoryId).then(
    (result) => update(repositoryId, { running: false, result, error: null }),
    (error) => update(repositoryId, { ...(runs.get(repositoryId) ?? IDLE), running: false, error: toApiError(error) }),
  );
}

export function useAnalysisRun(repositoryId: string) {
  const run = useSyncExternalStore(subscribe, () => runs.get(repositoryId) ?? IDLE);
  const analyze = useCallback(() => startAnalysis(repositoryId), [repositoryId]);
  return { ...run, analyze };
}
