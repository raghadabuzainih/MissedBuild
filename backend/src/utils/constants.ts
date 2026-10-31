import { timestamp } from "drizzle-orm/pg-core";

export const tz = (name: string) => timestamp(name, { withTimezone: true });
export const model = "muse-spark-1.3"

// Per-task Meta limits: timeout per attempt, and retries after a failed attempt.
// Worst case is roughly (maxRetries + 1) * timeoutMs plus the SDK's short backoff.
export const metaLimits = {
  refinement: { timeoutMs: 20_000, maxRetries: 0 },
  classification: { timeoutMs: 45_000, maxRetries: 1 },
  analysis: { timeoutMs: 90_000, maxRetries: 1 },
  // Small input (ideas and extensions of up to 3 analyses) and a short reply.
  comparison: { timeoutMs: 30_000, maxRetries: 1 },
} as const;
