import { axiosClient } from "./axiosClient";
import type { CategorySummary } from "./types";

// Only categories that currently hold saved repositories ("other" excluded).
export async function getCategorySummary(): Promise<CategorySummary[]> {
  const { data } = await axiosClient.get("/api/categories/summary");
  return data.categories;
}
