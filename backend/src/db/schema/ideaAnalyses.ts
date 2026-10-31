import { jsonb, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import type { IdeaAnalysisEntry, StoredComparison } from "../../types/ideaAnalysis";
import { tz } from "../../utils/constants";
import { searches } from "./searches";

export const ideaAnalysisStatusEnum = pgEnum("idea_analysis_status", [
  "processing",
  "completed",
  "partial",
  "failed",
  // None of the search results had enough evidence to analyze.
  "no_candidates",
]);

export const ideaAnalysisStageEnum = pgEnum("idea_analysis_stage", ["selecting", "analyzing", "comparing"]);

// The automatic analysis of a search: one repository (the closest match with
// enough evidence) analyzed with the regular pipeline. The comparison columns
// are unused for now (kept for a possible manual comparison later).
export const ideaAnalyses = pgTable("idea_analyses", {
  id: uuid("id").primaryKey().defaultRandom(),
  searchId: uuid("search_id")
    .notNull()
    .unique()
    .references(() => searches.id, { onDelete: "cascade" }),

  status: ideaAnalysisStatusEnum("status").notNull().default("processing"),
  // Only set while that work is really happening.
  stage: ideaAnalysisStageEnum("stage"),

  // Validated by ideaAnalysisEntrySchema on read.
  repositories: jsonb("repositories").$type<IdeaAnalysisEntry[]>().notNull().default([]),
  // Validated by storedComparisonSchema on read; null until compared.
  comparison: jsonb("comparison").$type<StoredComparison>(),
  comparisonPromptVersion: text("comparison_prompt_version"),

  warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),

  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  completedAt: tz("completed_at"),
});
