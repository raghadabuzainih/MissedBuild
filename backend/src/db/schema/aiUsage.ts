import { index, integer, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { tz } from "../../utils/constants";

export const aiOperationEnum = pgEnum("ai_operation", [
  "query_refinement",
  "classification",
  "repository_analysis",
  "idea_comparison",
]);

export const aiCallStatusEnum = pgEnum("ai_call_status", ["success", "failure", "timeout"]);

export const aiErrorCategoryEnum = pgEnum("ai_error_category", [
  "timeout",
  "rate_limited",
  "auth",
  "bad_request",
  "server_error",
  "connection",
  "unknown",
]);

// One row per Meta call. Token columns hold only what Meta reported (never
// estimates) and are null otherwise. No prompt, output or error message is stored.
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    operation: aiOperationEnum("operation").notNull(),
    model: text("model").notNull(),
    status: aiCallStatusEnum("status").notNull(),
    errorCategory: aiErrorCategoryEnum("error_category"),
    requestId: text("request_id"),

    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    cachedInputTokens: integer("cached_input_tokens"),
    reasoningTokens: integer("reasoning_tokens"),

    // The whole SDK call, including its retries and backoff.
    durationMs: integer("duration_ms").notNull(),

    createdAt: tz("created_at").defaultNow().notNull(),
  },
  (table) => [index("ai_usage_operation_created_idx").on(table.operation, table.createdAt)],
);
