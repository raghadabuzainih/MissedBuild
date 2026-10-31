import { z } from "zod";
import type { ExcerptSegment } from "../utils/fileExcerpt.js";
import type { RepositoryMapEvidence, Scanned } from "../utils/secretScan.js";
import { SOURCE_AREAS, SOURCE_FILE_CATEGORIES } from "../utils/sourceSelection.js";

// The shape stored in repository_analyses.result. Validated before insert and
// after every read. analysis-v3 results carry `version: 3`; results from
// analysis-v1/v2 keep the earlier shape and are still accepted.

const label = z.enum(["fact", "inference", "hypothesis"]);

// Links are built by the server from the repository's own README URL, a
// stored issue, a source file or the file tree at the analyzed commit, never
// taken from AI output. "structure" is the repository map.
const source = z.object({
  type: z.enum(["readme", "issue", "file", "structure"]),
  url: z.string(),
  issueNumber: z.number().int().optional(),
  // Source files: the path, and the line where the excerpt was found.
  path: z.string().optional(),
  line: z.number().int().positive().optional(),
  // Present only when it was found verbatim in the source text.
  excerpt: z.string().optional(),
});

// Which source files were read (no content, no secret values). Added with
// analysis-v2; absent in earlier results.
export const sourceFilesSummarySchema = z.object({
  commitSha: z.string(),
  treeTruncated: z.boolean(),
  files: z.array(
    z.object({
      path: z.string(),
      category: z.enum(SOURCE_FILE_CATEGORIES),
      role: z.string().nullable(),
      // Added with the area-based selection; absent in earlier results.
      area: z.enum([...SOURCE_AREAS, "manifest", "fallback"]).optional(),
      reason: z.string(),
      promptChars: z.number().int(),
      repoChars: z.number().int(),
      truncated: z.boolean(),
      excerpt: z.enum(["full", "head", "head_outline", "outline"]),
      redactions: z.number().int(),
      redactionRules: z.array(z.string()),
    }),
  ),
  totalPromptChars: z.number().int(),
  totalRepoChars: z.number().int(),
  excluded: z.record(z.enum(SOURCE_FILE_CATEGORIES), z.object({ files: z.number().int(), bytes: z.number().int() })),
  unused: z.array(
    z.object({
      path: z.string(),
      reason: z.enum(["missing", "binary", "too_large", "private_key", "too_many_secrets", "no_budget"]),
      redactions: z.number().int().optional(),
      redactionRules: z.array(z.string()).optional(),
    }),
  ),
  // The repository map's size; absent in earlier results, null when it was withheld.
  map: z.object({ promptChars: z.number().int(), lines: z.number().int() }).nullable().optional(),
});
export type SourceFilesSummary = z.infer<typeof sourceFilesSummarySchema>;

const finding = z.object({
  id: z.string(),
  text: z.string(),
  label,
  sources: z.array(source),
});

// analysis-v3: user value first. Conclusions are never facts, and every
// extension or improvement says whether the gap is verified.
const conclusionLabel = z.enum(["inference", "hypothesis"]);
// verified_gap: an open issue or the README states it; needs_investigation: everything else.
export const EVIDENCE_STATUSES = ["verified_gap", "needs_investigation"] as const;
export const TECHNICAL_AREAS = ["code_quality", "compatibility", "refactoring", "testing", "documentation"] as const;

// The list sections of the AI's reply (the summary is required: without it
// there is no analysis).
export const ANALYSIS_SECTIONS = [
  "features",
  "limitations",
  "projectIdeas",
  "functionalExtensions",
  "technicalImprovements",
  "evidenceLimitations",
] as const;
export type AnalysisSection = (typeof ANALYSIS_SECTIONS)[number];
// invalid_json: broken JSON confined to that section; wrong_shape: not a list;
// missing: not in the reply.
export const UNAVAILABLE_REASONS = ["invalid_json", "wrong_shape", "missing"] as const;

// A partial analysis has at least one unavailable section.
export const isPartialResult = (result: object) =>
  "unavailableSections" in result && Array.isArray(result.unavailableSections) && result.unavailableSections.length > 0;

const analysisResultV3Schema = z.object({
  version: z.literal(3),
  summary: z.object({ text: z.string(), label, sources: z.array(source) }),
  features: z.array(finding),
  limitations: z.array(finding),
  // Larger, independently valuable projects built by extending or reusing the repository.
  projectIdeas: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      problem: z.string(),
      targetUsers: z.string(),
      solution: z.string(),
      coreFeatures: z.array(z.string()),
      // What can be reused, each grounded in the repository.
      reuse: z.array(z.object({ text: z.string(), sources: z.array(source) })),
      toBuild: z.array(z.string()),
      complexity: z.enum(["low", "medium", "high"]),
      label: conclusionLabel,
      basedOn: z.array(z.string()),
      sources: z.array(source),
      evidenceLimitations: z.string(),
    }),
  ),
  // New capabilities that improve the existing product for its users.
  functionalExtensions: z.array(
    finding.extend({
      title: z.string(),
      userValue: z.string(),
      evidenceStatus: z.enum(EVIDENCE_STATUSES),
      label: conclusionLabel,
      basedOn: z.array(z.string()),
    }),
  ),
  technicalImprovements: z.array(
    finding.extend({
      title: z.string(),
      area: z.enum(TECHNICAL_AREAS),
      evidenceStatus: z.enum(EVIDENCE_STATUSES),
      label: conclusionLabel,
      basedOn: z.array(z.string()),
    }),
  ),
  evidenceLimitations: z.array(z.string()),
  sourceFiles: sourceFilesSummarySchema.nullable().optional(),
  // A partial analysis: a section of the AI's reply that could not be used
  // (its content is not shown at all). Absent on complete analyses.
  unavailableSections: z.array(z.object({ section: z.enum(ANALYSIS_SECTIONS), reason: z.enum(UNAVAILABLE_REASONS) })).optional(),
  // Items of a section left out because they were incomplete or duplicated.
  droppedItems: z.partialRecord(z.enum(ANALYSIS_SECTIONS), z.number().int().positive()).optional(),
});

// analysis-v1/v2 results (opportunities instead of extensions and improvements).
const legacyResultSchema = z.object({
  summary: z.object({ text: z.string(), label, sources: z.array(source) }),
  features: z.array(finding),
  limitations: z.array(finding),
  opportunities: z.array(
    finding.extend({
      kind: z.enum(["missing_feature", "improvement", "feature_request"]),
      title: z.string(),
      basedOn: z.array(z.string()),
    }),
  ),
  projectIdeas: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      problem: z.string(),
      solution: z.string(),
      intendedUsers: z.string(),
      coreFeatures: z.array(z.string()),
      complexity: z.enum(["low", "medium", "high"]),
      // Ideas are never presented as facts.
      label: z.enum(["inference", "hypothesis"]),
      basedOn: z.array(z.string()),
      sources: z.array(source),
      evidenceLimitations: z.string(),
    }),
  ),
  evidenceLimitations: z.array(z.string()),
  sourceFiles: sourceFilesSummarySchema.nullable().optional(),
});

export const analysisResultSchema = z.union([analysisResultV3Schema, legacyResultSchema]);

// What parseAnalysis produces now.
export type AnalysisResult = z.infer<typeof analysisResultV3Schema>;
// Anything that may be stored, including earlier versions.
export type StoredAnalysisResult = z.infer<typeof analysisResultSchema>;
export type AnalysisSource = z.infer<typeof source>;

// One source file as sent to the AI: `rendered` is the prompt text, and
// `segments` keep repository text apart from our markers for checking excerpts.
export type SourceFileEvidence = {
  ref: string; // "file:<path>"
  path: string;
  // The file at the analyzed commit.
  htmlUrl: string;
  rendered: string;
  segments: ExcerptSegment[];
};

// What the analysis is based on, collected from GitHub (or the stored copy).
export type AnalysisEvidence = {
  fullName: string;
  description: string | null;
  language: string | null;
  topics: string[];
  // Only redactReadmeAndIssues produces these: raw repository text does not type-check here.
  readme: Scanned<{ url: string; content: string }> | null;
  issues: Scanned<{
    number: number;
    title: string;
    body: string | null;
    state: "open" | "closed";
    // Fresh from GitHub only ("not_planned": declined); null for stored copies.
    stateReason?: "completed" | "not_planned" | "reopened" | null;
    htmlUrl: string;
  }>[];
  // Only scanSourceFile produces these.
  files: Scanned<SourceFileEvidence>[];
  // The repository map; only scanRepositoryMap produces it.
  map: Scanned<RepositoryMapEvidence> | null;
  // Which files were read; stored with the result. Null when none could be read.
  sourceFiles: SourceFilesSummary | null;
  // Known gaps in the evidence, added to the result's evidenceLimitations.
  notes: string[];
};
