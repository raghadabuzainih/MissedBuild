import { APIConnectionError, APIError } from "openai";
import { db } from "../db/index.js";
import { aiUsage } from "../db/schema/index.js";
import { model } from "../utils/constants.js";
import { generateWithMetaDetailed, isMetaTimeout, type MetaRequestOptions } from "./metaService.js";

export type AiOperation = (typeof aiUsage.$inferInsert)["operation"];
type ErrorCategory = NonNullable<(typeof aiUsage.$inferInsert)["errorCategory"]>;

// Calls Meta and records one ai_usage row. Returns the text and rethrows any
// error unchanged, so callers keep their own error handling and fallbacks.
// To remove tracking, call generateWithMeta(prompt, limits) again in the three
// AI services and delete this file.
export async function generateTracked(
  operation: AiOperation,
  prompt: string,
  options: MetaRequestOptions,
): Promise<string> {
  const startedAt = performance.now();
  try {
    const { text, usage, requestId } = await generateWithMetaDetailed(prompt, options);
    record({
      operation,
      status: "success",
      requestId,
      durationMs: elapsed(startedAt),
      inputTokens: tokenCount(usage?.input_tokens),
      outputTokens: tokenCount(usage?.output_tokens),
      totalTokens: tokenCount(usage?.total_tokens),
      cachedInputTokens: tokenCount(usage?.input_tokens_details?.cached_tokens),
      reasoningTokens: tokenCount(usage?.output_tokens_details?.reasoning_tokens),
    });
    return text;
  } catch (error) {
    const timedOut = isMetaTimeout(error);
    record({
      operation,
      status: timedOut ? "timeout" : "failure",
      errorCategory: timedOut ? "timeout" : errorCategory(error),
      requestId: error instanceof APIError ? (error.requestID ?? null) : null,
      durationMs: elapsed(startedAt),
    });
    throw error;
  }
}

const elapsed = (startedAt: number) => Math.round(performance.now() - startedAt);

// Only counts Meta actually reported; anything else is stored as null.
const tokenCount = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;

function errorCategory(error: unknown): ErrorCategory {
  // Connection errors (including timeouts) are APIErrors without a status.
  if (error instanceof APIConnectionError) return "connection";
  if (!(error instanceof APIError) || error.status === undefined) return "unknown";
  if (error.status === 429) return "rate_limited";
  if (error.status === 401 || error.status === 403) return "auth";
  if (error.status >= 500) return "server_error";
  if (error.status >= 400) return "bad_request";
  return "unknown";
}

// Never blocks or fails the AI call: a failed insert, synchronous or not, is only logged.
function record(values: Omit<typeof aiUsage.$inferInsert, "model">): void {
  const logFailure = (error: unknown) =>
    console.error(`Could not record AI usage: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}`);
  try {
    db.insert(aiUsage).values({ ...values, model }).catch(logFailure);
  } catch (error) {
    logFailure(error);
  }
}
