import { useEffect, useState } from "react";
import { toApiError } from "../api/errors";
import { getLatestAnalysis, getRepositoryDetail } from "../api/repositories";
import type { Analysis, ApiError, RepositoryDetail } from "../api/types";
import { useAnalysisRun } from "./useAnalysisRun";

type State = {
  detail: RepositoryDetail | null;
  saved: Analysis | null;
  loading: boolean; // repository detail + saved analysis
  loadError: ApiError | null;
};

// Mount one instance per repository (key the component by its ID).
// Analysis requests go through the shared run store (useAnalysisRun).
export function useRepositoryAnalysis(repositoryId: string) {
  const [state, setState] = useState<State>({ detail: null, saved: null, loading: true, loadError: null });
  const run = useAnalysisRun(repositoryId);

  useEffect(() => {
    let mounted = true;
    Promise.all([getRepositoryDetail(repositoryId), getLatestAnalysis(repositoryId)]).then(
      ([detail, saved]) => mounted && setState({ detail, saved, loading: false, loadError: null }),
      (error) => mounted && setState((s) => ({ ...s, loadError: toApiError(error), loading: false })),
    );
    return () => {
      mounted = false;
    };
  }, [repositoryId]);

  // The newer of the saved analysis and the one this tab requested.
  const analysis =
    run.result && (!state.saved || new Date(run.result.createdAt) >= new Date(state.saved.createdAt)) ? run.result : state.saved;
  return {
    ...state,
    analysis,
    // The last request found unchanged evidence and returned the saved result.
    unchanged: analysis !== null && analysis === run.result && run.result.cached,
    running: run.running,
    analyzeError: run.error,
    analyze: run.analyze,
  };
}
