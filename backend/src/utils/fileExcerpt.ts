// A bounded, deterministic view of one source file: the whole file when it
// fits, otherwise its start plus an outline of declaration lines from the
// rest. Pure. Repository text and our own markers are kept in separate
// segments, and every piece of repository text keeps its line number.
//
// The limit applies to the file's full cost in the prompt: our markers,
// line labels and the JSON wrapper and escaping (see filePromptCost), not
// just the repository characters.
import { quoteForPrompt } from "./aiJson.js";

export type ExcerptSegment =
  // Consecutive lines copied verbatim (cut only for a first line that alone is too long).
  | { kind: "code"; startLine: number; endLine: number; text: string }
  // One declaration line from the omitted part: a signature, not proof of behavior.
  | { kind: "outline"; line: number; text: string }
  // Our own note about omitted lines; never repository text.
  | { kind: "marker"; text: string };

// "outline": declaration lines only, for files read for breadth.
export type ExcerptMode = "full" | "head" | "head_outline" | "outline";

export type FileExcerpt = {
  mode: ExcerptMode;
  segments: ExcerptSegment[];
  // The exact text that goes into the prompt for this file.
  rendered: string;
  // What the file adds to the prompt (see filePromptCost); this is what the limits apply to.
  promptChars: number;
  // Repository characters included (code and outline text).
  repoChars: number;
  // True when part of the file is not included.
  truncated: boolean;
  totalLines: number;
};

export const EXCERPT_LIMITS = {
  // Minimum share of the file start; it grows when the outline is short.
  minHeadChars: 2_500,
  // Long outline lines (e.g. one-line signatures with many parameters) are cut.
  maxOutlineLineChars: 200,
  maxOutlineEntries: 80,
} as const;

// ---------- prompt cost ----------

// Each source file will appear in the prompt's evidence JSON as one array
// element {"ref":"file:<path>","text":"<rendered>"}, encoded like the rest of
// the evidence (quoteForPrompt), followed by a separating comma. This is
// exactly the number of characters it adds.
export function filePromptCost(path: string, rendered: string): number {
  return quoteForPrompt({ ref: `file:${path}`, text: rendered }).length + 1;
}

// Before the content is known: the wrapper plus a margin for escaping
// (newlines, quotes and "<" each take more than one character).
export function estimatePromptCost(path: string, bytes: number): number {
  return filePromptCost(path, "") + Math.ceil(bytes * 1.1);
}

// ---------- outline patterns ----------

// Declaration lines by file type. A line-based heuristic: multi-line
// signatures contribute their first line only.
const OUTLINE_PATTERNS: [RegExp, RegExp][] = [
  [/\.py$/i, /^\s{0,4}(?:(?:async\s+)?def|class)\s+\w+|^\s{0,4}@\w[\w.]*(?:\(|$)/],
  [
    /\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i,
    /^(?:export\s+(?:default\s+)?)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|class|interface|type|enum|const|let|var)\s+[\w$]+|^\s{2,4}(?:(?:public|private|protected|static|async|get|set|readonly)\s+)*[\w$]+\s*\([^)]*\)?\s*(?::[^{=]+)?\{\s*$|^(?:module\.exports|exports\.[\w$]+|[\w$]+\.(?:get|post|put|patch|delete|use|route)\s*\()|^[\w$]+(?:\.[\w$]+)+\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>)/,
  ],
  [/\.rs$/i, /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?(?:fn|struct|enum|trait|impl|mod|type)\b/],
  [/\.go$/i, /^(?:func|type)\s/],
  [
    /\.(?:cs|java|kt|scala)$/i,
    /^\s*(?:\[[\w(", ]+\]\s*)?(?:public|internal|protected|private)\b[^=;]*(?:\bclass\b|\binterface\b|\brecord\b|\bstruct\b|\benum\b|\()|^\s*\[(?:Http\w+|Route)\b|^\s*@(?:\w+Mapping|RestController|Controller|Service)\b/,
  ],
  [/\.(?:razor|cshtml)$/i, /^@(?:page|code|inject|using|implements|inherits)\b|^\s*(?:public|private|protected)\b.*\(/],
  [/\.rb$/i, /^\s*(?:def|class|module)\s/],
  [/\.php$/i, /^\s*(?:(?:public|private|protected|static|abstract|final)\s+)*(?:function|class|interface|trait)\s/],
  [/\.swift$/i, /^\s*(?:(?:public|private|internal|open|static|final)\s+)*(?:func|class|struct|enum|protocol|extension)\s/],
];

export function outlinePatternFor(path: string): RegExp | null {
  return OUTLINE_PATTERNS.find(([file]) => file.test(path))?.[1] ?? null;
}

// ---------- rendering ----------

const OUTLINE_LABEL = (line: number) => `L${line}: `;
const omittedMarker = (from: number, to: number) =>
  from === to ? `[line ${from} not included]` : `[lines ${from}-${to} not included]`;
const outlineMarker = (from: number, to: number) =>
  `[lines ${from}-${to}: outline only, declaration lines (signatures) without their bodies; L<n> = line number]`;

// One segment per line block; outline entries carry their line label.
export function renderSegments(segments: ExcerptSegment[]): string {
  return segments
    .map((segment) => (segment.kind === "outline" ? `${OUTLINE_LABEL(segment.line)}${segment.text}` : segment.text))
    .join("\n");
}

// ---------- building ----------

type Lines = string[];

function codeSegment(lines: Lines, count: number): ExcerptSegment & { kind: "code" } {
  return { kind: "code", startLine: 1, endLine: count, text: lines.slice(0, count).join("\n") };
}

function headSegments(lines: Lines, count: number): ExcerptSegment[] {
  const segments: ExcerptSegment[] = [codeSegment(lines, count)];
  if (count < lines.length) segments.push({ kind: "marker", text: omittedMarker(count + 1, lines.length) });
  return segments;
}

function outlineSegments(lines: Lines, headCount: number, entries: { line: number; text: string }[]): ExcerptSegment[] {
  const shown = entries.filter((entry) => entry.line > headCount);
  if (shown.length === 0) return headSegments(lines, headCount);
  return [
    // Declarations only (headCount 0): no code block at all.
    ...(headCount > 0 ? [codeSegment(lines, headCount)] : []),
    { kind: "marker" as const, text: outlineMarker(headCount + 1, lines.length) },
    ...shown.map((entry) => ({ kind: "outline" as const, line: entry.line, text: entry.text })),
  ];
}

// The largest n in [low, high] with fits(n), assuming fits is monotone
// (true up to some n, false after). Returns low - 1 when none fits.
function largestFitting(low: number, high: number, fits: (n: number) => boolean): number {
  let best = low - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (fits(mid)) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

function result(mode: ExcerptMode, segments: ExcerptSegment[], path: string, totalLines: number): FileExcerpt {
  const rendered = renderSegments(segments);
  const repoChars = segments.reduce((sum, s) => sum + (s.kind === "marker" ? 0 : s.text.length), 0);
  return { mode, segments, rendered, promptChars: filePromptCost(path, rendered), repoChars, truncated: mode !== "full", totalLines };
}

export type ExcerptOptions = {
  // Allow declaration lines (false: manifests and other non-code files).
  outline: boolean;
  // Read for breadth: declaration lines only, without the file's start.
  outlineOnly?: boolean;
};

// `maxPromptChars` bounds filePromptCost of the rendered excerpt. Returns
// null when not even the file's first line (cut) fits.
export function buildExcerpt(path: string, content: string, maxPromptChars: number, options: ExcerptOptions): FileExcerpt | null {
  // CRLF files: line numbers count "\n"; the "\r" carries no meaning.
  const lines = content.split("\n").map((line) => line.replace(/\r$/, ""));
  const total = lines.length;
  const fits = (segments: ExcerptSegment[]) => filePromptCost(path, renderSegments(segments)) <= maxPromptChars;

  const whole: ExcerptSegment[] = [codeSegment(lines, total)];
  if (fits(whole)) return result("full", whole, path, total);

  // Start only: as many whole lines as fit.
  const headOnly = (): FileExcerpt | null => {
    const count = largestFitting(1, total, (n) => fits(headSegments(lines, n)));
    if (count >= 1) return result("head", headSegments(lines, count), path, total);
    // A first line that alone is too long (e.g. minified): cut it.
    const marker: ExcerptSegment = { kind: "marker", text: omittedMarker(1, total) };
    const cutTo = largestFitting(1, lines[0].length, (n) =>
      fits([{ kind: "code", startLine: 1, endLine: 1, text: lines[0].slice(0, n) }, marker]),
    );
    if (cutTo < 1) return null;
    return result("head", [{ kind: "code", startLine: 1, endLine: 1, text: lines[0].slice(0, cutTo) }, marker], path, total);
  };

  const pattern = options.outline ? outlinePatternFor(path) : null;
  if (!pattern) return headOnly();

  if (options.outlineOnly) {
    // Declaration lines from the whole file, in order, while they fit.
    const entries: { line: number; text: string }[] = [];
    for (let i = 0; i < total && entries.length < EXCERPT_LIMITS.maxOutlineEntries; i++) {
      if (!pattern.test(lines[i])) continue;
      const entry = { line: i + 1, text: lines[i].trimEnd().slice(0, EXCERPT_LIMITS.maxOutlineLineChars) };
      if (!fits(outlineSegments(lines, 0, [...entries, entry]))) break;
      entries.push(entry);
    }
    if (entries.length === 0) return headOnly();
    return result("outline", outlineSegments(lines, 0, entries), path, total);
  }

  // 1. A minimum start, measured in repository characters.
  let minHead = 0;
  for (let used = 0; minHead < total; minHead++) {
    used += lines[minHead].length + (minHead > 0 ? 1 : 0);
    if (used > EXCERPT_LIMITS.minHeadChars) break;
  }
  if (minHead === 0 || !fits(headSegments(lines, minHead))) return headOnly();

  // 2. Outline candidates after it, added in file order while everything fits.
  const entries: { line: number; text: string }[] = [];
  for (let i = minHead; i < total && entries.length < EXCERPT_LIMITS.maxOutlineEntries; i++) {
    if (!pattern.test(lines[i])) continue;
    const entry = { line: i + 1, text: lines[i].trimEnd().slice(0, EXCERPT_LIMITS.maxOutlineLineChars) };
    if (!fits(outlineSegments(lines, minHead, [...entries, entry]))) break;
    entries.push(entry);
  }
  if (entries.length === 0) return headOnly();

  // 3. The start grows into what the outline leaves; entries it now covers drop out.
  let head = minHead;
  while (head < total && fits(outlineSegments(lines, head + 1, entries))) head += 1;
  const segments = outlineSegments(lines, head, entries);
  return result(segments.some((s) => s.kind === "outline") ? "head_outline" : "head", segments, path, total);
}
