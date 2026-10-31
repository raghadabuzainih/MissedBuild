import { z } from "zod";

// The automatic analysis of a search (one repository; see ideaAnalysisService).
// Stored in idea_analyses; validated after every read.

export const IDEA_ENTRY_STATUSES = ["pending", "running", "succeeded", "failed"] as const;

// One selected repository and how its analysis went.
export const ideaAnalysisEntrySchema = z.object({
  repositoryId: z.string(),
  fullName: z.string(),
  // Why it was chosen (relevance, activity, evidence), shown to the user.
  selectionReason: z.string(),
  status: z.enum(IDEA_ENTRY_STATUSES),
  analysisId: z.string().nullable(),
  // The analysis came from the saved result (unchanged evidence, no AI call).
  cached: z.boolean(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  // Whether the failure happened after a paid Meta call; null when unknown.
  paidCallMade: z.boolean().nullable(),
  // Set on a failed entry that was replaced by the next suitable repository.
  replacedBy: z.string().nullable(),
  // Set on an entry that replaced a failed one.
  replaces: z.string().nullable(),
});
export type IdeaAnalysisEntry = z.infer<typeof ideaAnalysisEntrySchema>;

// A comparison references items of the individual analyses; it never holds
// their text, so every opportunity stays tied to its own analysis and evidence.
export const COMPARISON_ITEM_KINDS = ["idea", "extension"] as const;
export const OVERLAP_BASES = ["problem", "target_users", "value"] as const;

const itemRefSchema = z.object({
  repositoryId: z.string(),
  analysisId: z.string(),
  kind: z.enum(COMPARISON_ITEM_KINDS),
  itemId: z.string(),
});
export type ComparisonItemRef = z.infer<typeof itemRefSchema>;

export const storedComparisonSchema = z.object({
  // Opportunities from at least two repositories that genuinely overlap.
  shared: z.array(
    z.object({
      theme: z.string(),
      overlapsIn: z.array(z.enum(OVERLAP_BASES)).min(1),
      items: z.array(itemRefSchema).min(2),
    }),
  ),
  // Everything not in a shared group, per repository (computed by our code).
  unique: z.array(z.object({ repositoryId: z.string(), analysisId: z.string(), items: z.array(itemRefSchema) })),
});
export type StoredComparison = z.infer<typeof storedComparisonSchema>;
