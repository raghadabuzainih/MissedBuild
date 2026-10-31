import { useEffect, useState } from "react";
import { getCategorySummary } from "../api/categories";
import type { CategorySummary } from "../api/types";

// Loaded each time `enabled` becomes true (whenever the landing page shows),
// so categories appear and disappear with the saved repositories. Any failure
// gives an empty list: the section is then hidden rather than shown empty.
export function useCategorySummary(enabled: boolean): CategorySummary[] {
  const [categories, setCategories] = useState<CategorySummary[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    getCategorySummary()
      .then((list) => current && setCategories(list))
      .catch(() => current && setCategories([]));
    return () => {
      current = false;
    };
  }, [enabled]);

  return categories;
}
