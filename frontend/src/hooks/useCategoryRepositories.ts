import { useCallback, useEffect, useState } from "react";
import { toApiError } from "../api/errors";
import { listRepositories } from "../api/repositories";
import type { AnalysisFilter, ApiError, RepositoryList } from "../api/types";

export const CATEGORY_PAGE_SIZE = 10;

type Result = { key: string; data: RepositoryList | null; error: ApiError | null };

// One page of saved repositories in a category, optionally by analysis status.
// Pages come from the server in a stable order (stars, then ID), so a
// repository is never listed twice.
export function useCategoryRepositories(categoryId: string, analysis: AnalysisFilter, page: number) {
  const [attempt, setAttempt] = useState(0);
  // The result is tagged with its request, so `loading` is derived, not set.
  const key = `${categoryId}|${analysis}|${page}|${attempt}`;
  const [result, setResult] = useState<Result>({ key: "", data: null, error: null });

  useEffect(() => {
    let current = true;
    listRepositories({ category: categoryId, analysis, limit: CATEGORY_PAGE_SIZE, offset: (page - 1) * CATEGORY_PAGE_SIZE })
      .then((list) => current && setResult({ key, data: list, error: null }))
      // The previous page stays visible behind the error.
      .catch((requestError) => current && setResult((previous) => ({ key, data: previous.data, error: toApiError(requestError) })));
    return () => {
      current = false;
    };
  }, [categoryId, analysis, page, key]);

  const loading = result.key !== key;
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { data: result.data, error: loading ? null : result.error, loading, retry };
}
