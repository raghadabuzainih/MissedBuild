import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { tz } from "../../utils/constants";

export const searchStatusEnum = pgEnum("search_status", [
  "processing",
  "completed",
  "partial",
  "no_results",
  "needs_clarification",
  "failed",
]);

export const searchStageEnum = pgEnum("search_stage", [
  "refining",
  "searching_github",
  "processing_results",
]);

// From the earlier two-option flow; every search is "explore" now (one flow,
// with one automatic analysis in idea_analyses). Kept to avoid a migration.
export const searchModeEnum = pgEnum("search_mode", ["explore", "analyze"]);

export const searches = pgTable(
  "searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    query: text("query").notNull(),
    fingerprint: text("fingerprint").notNull(),
    mode: searchModeEnum("mode").notNull().default("explore"),

    status: searchStatusEnum("status").notNull().default("processing"),
    // Only set while that work is really happening.
    stage: searchStageEnum("stage"),

    refinedQueries: jsonb("refined_queries")
      .$type<string[]>()
      .notNull()
      .default([]),
    aiRefined: boolean("ai_refined").notNull().default(false),
    clarificationQuestion: text("clarification_question"),

    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    warnings: jsonb("warnings")
      .$type<string[]>()
      .notNull()
      .default([]),

    resultCount: integer("result_count").notNull().default(0),
    // GitHub results left out because they did not match the idea closely enough.
    filteredCount: integer("filtered_count").notNull().default(0),

    createdAt: tz("created_at").notNull().defaultNow(),
    updatedAt: tz("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
    completedAt: tz("completed_at"),
  },
  (table) => [index("searches_fingerprint_idx").on(table.fingerprint)],
);
