// Detects and redacts likely credentials in repository text (README, issues,
// source files) before it is sent to the AI. Pure: no I/O, no logging.
// Results carry only counts and rule names, never matched values.
import type { SourceFileEvidence } from "../types/analysis.js";
import { buildExcerpt, type ExcerptOptions, type FileExcerpt } from "./fileExcerpt.js";

export type SecretRule =
  | "private_key_block"
  | "aws_access_key_id"
  | "github_token"
  | "slack_token"
  | "stripe_live_key"
  | "google_api_key"
  | "openai_or_anthropic_key"
  | "sendgrid_key"
  | "npm_token"
  | "jwt"
  | "url_with_password"
  | "assigned_credential";

export type RedactionResult =
  | { status: "clean"; text: string; redactions: 0; rules: [] }
  | { status: "redacted"; text: string; redactions: number; rules: SecretRule[] }
  // The whole text must be withheld: a private key, or too many matches to trust redaction.
  | { status: "dropped"; reason: "private_key" | "too_many_matches"; redactions: number; rules: SecretRule[] };

// More matches than this and the text is withheld instead of redacted.
export const MAX_REDACTIONS = 3;

type Pattern = {
  rule: SecretRule;
  regex: RegExp;
  // Capture group holding the secret value; 0 = the whole match.
  group: number;
  // Optional check on the value to skip placeholders and ordinary words.
  accept?: (value: string) => boolean;
};

const PRIVATE_KEY = /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/;

// Values that are clearly not real credentials.
const PLACEHOLDER =
  /^(?:x+|\*+|\.+|<[^>]*>|\$\{[^}]*\}|\$\w+|%\w+%|\{\{[^}]*\}\})$|example|sample|dummy|placeholder|changeme|change_me|your[_-]|my[_-]?(?:secret|password|key)|test|fake|redacted|xxx/i;

// Shannon entropy in bits per character: random keys score high, words low.
function entropy(value: string): number {
  const counts = new Map<string, number>();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let bits = 0;
  for (const n of counts.values()) bits -= (n / value.length) * Math.log2(n / value.length);
  return bits;
}

// A plausible secret: not a placeholder, varied, and not a plain identifier
// such as "user.password" (needs a digit, or both upper and lower case).
const looksLikeSecret = (value: string) =>
  !PLACEHOLDER.test(value) && entropy(value) >= 3 && (/\d/.test(value) || (/[a-z]/.test(value) && /[A-Z]/.test(value)));

// All patterns are single-line, so redaction never changes line numbers.
const PATTERNS: Pattern[] = [
  { rule: "aws_access_key_id", regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/gd, group: 0 },
  { rule: "github_token", regex: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/gd, group: 0 },
  { rule: "slack_token", regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}/gd, group: 0 },
  { rule: "stripe_live_key", regex: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/gd, group: 0 },
  { rule: "google_api_key", regex: /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/gd, group: 0 },
  { rule: "openai_or_anthropic_key", regex: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}/gd, group: 0 },
  { rule: "sendgrid_key", regex: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/gd, group: 0 },
  { rule: "npm_token", regex: /\bnpm_[A-Za-z0-9]{36}\b/gd, group: 0 },
  { rule: "jwt", regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/gd, group: 0 },
  {
    // Only the password is redacted; the scheme, user and host stay readable.
    rule: "url_with_password",
    regex: /\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s:/@'"`]{1,64}:([^\s@/'"`]{3,128})@[^\s'"`]+/gid,
    group: 1,
    accept: (value) => !PLACEHOLDER.test(value) && !/^(?:pass(?:word)?|pwd|secret)$/i.test(value),
  },
  {
    // A credential-like name assigned a quoted literal: password = "…", "apiKey": "…".
    rule: "assigned_credential",
    regex:
      /\b[\w.-]*(?:password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?key|auth[_-]?token|client[_-]?secret|private[_-]?key)[\w.-]*["']?\s*[:=]\s*["']([^"'\s]{8,200})["']/gid,
    group: 1,
    accept: looksLikeSecret,
  },
];

type Match = { start: number; end: number; rule: SecretRule };

function findMatches(text: string): Match[] {
  const matches: Match[] = [];
  for (const { rule, regex, group, accept } of PATTERNS) {
    for (const m of text.matchAll(regex)) {
      const value = m[group];
      if (value === undefined || (accept && !accept(value))) continue;
      // Exact position of the captured value (the regexes use the "d" flag).
      const [start, end] = m.indices![group]!;
      matches.push({ start, end, rule });
    }
  }
  // Overlapping matches (e.g. a token inside an assignment) count once.
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Match[] = [];
  for (const match of matches) {
    const last = merged[merged.length - 1];
    if (last && match.start < last.end) last.end = Math.max(last.end, match.end);
    else merged.push({ ...match });
  }
  return merged;
}

export function redactSecrets(text: string): RedactionResult {
  if (PRIVATE_KEY.test(text)) {
    const others = findMatches(text);
    const rules = [...new Set<SecretRule>(["private_key_block", ...others.map((m) => m.rule)])];
    return { status: "dropped", reason: "private_key", redactions: others.length + 1, rules };
  }
  const matches = findMatches(text);
  if (matches.length === 0) return { status: "clean", text, redactions: 0, rules: [] };
  const rules = [...new Set(matches.map((m) => m.rule))];
  if (matches.length > MAX_REDACTIONS) return { status: "dropped", reason: "too_many_matches", redactions: matches.length, rules };

  let redacted = text;
  for (const match of [...matches].reverse()) {
    redacted = `${redacted.slice(0, match.start)}[REDACTED:${match.rule}]${redacted.slice(match.end)}`;
  }
  return { status: "redacted", text: redacted, redactions: matches.length, rules };
}

// ---------- README and issues ----------

declare const scannedBrand: unique symbol;
// A value that went through redactReadmeAndIssues. Only that function creates
// it, and the analysis input (AnalysisEvidence) accepts nothing else, so raw
// README or issue text cannot reach the AI by mistake.
export type Scanned<T> = T & { readonly [scannedBrand]: true };
const markScanned = <T>(value: T) => value as Scanned<T>;

export type RedactableReadme = { url: string; content: string };
export type RedactableIssue = { number: number; title: string; body: string | null };

export type EvidenceRedaction<I> = {
  readme: Scanned<RedactableReadme> | null;
  issues: Scanned<I>[];
  // Evidence notes (no values), shown with the analysis.
  notes: string[];
};

// Applies the same rules as for source files: redact, or withhold the README
// or an issue entirely on a private key or more than MAX_REDACTIONS matches.
// An issue's title and body are scanned together.
export function redactReadmeAndIssues<I extends RedactableIssue>(readme: RedactableReadme | null, issues: I[]): EvidenceRedaction<I> {
  const notes: string[] = [];
  let outReadme: Scanned<RedactableReadme> | null = null;
  if (readme) {
    const result = redactSecrets(readme.content);
    if (result.status === "dropped") {
      notes.push("The README was withheld because it appears to contain credentials.");
    } else {
      outReadme = markScanned({ ...readme, content: result.text });
      if (result.status === "redacted") notes.push("Possible credentials were redacted from the README.");
    }
  }

  const outIssues: Scanned<I>[] = [];
  let withheld = 0;
  let redacted = 0;
  for (const issue of issues) {
    // Joined with a separator no pattern can cross, then split back.
    const SEPARATOR = "\n\u0000\n";
    const joined = `${issue.title}${SEPARATOR}${issue.body ?? ""}`;
    const result = redactSecrets(joined);
    if (result.status === "dropped") {
      withheld += 1;
      continue;
    }
    if (result.status === "clean") {
      outIssues.push(markScanned({ ...issue }));
      continue;
    }
    redacted += 1;
    const at = result.text.indexOf(SEPARATOR);
    const title = result.text.slice(0, at);
    const body = result.text.slice(at + SEPARATOR.length);
    outIssues.push(markScanned({ ...issue, title, body: issue.body === null ? null : body }));
  }
  if (withheld > 0) notes.push(`${withheld} issue(s) were withheld because they appear to contain credentials.`);
  if (redacted > 0) notes.push(`Possible credentials were redacted from ${redacted} issue(s).`);
  return { readme: outReadme, issues: outIssues, notes };
}

// ---------- source files ----------

export type SourceFileScan =
  | {
      status: "ok";
      // What goes into the analysis evidence.
      file: Scanned<SourceFileEvidence>;
      excerpt: FileExcerpt;
      redactions: number;
      rules: SecretRule[];
    }
  // Not even the start of the first line fits in the allowed size.
  | { status: "no_room"; redactions: number; rules: SecretRule[] }
  | { status: "dropped"; reason: "private_key" | "too_many_matches"; redactions: number; rules: SecretRule[] };

// The whole file is scanned before it is cut, so a secret cannot straddle
// the cut; the excerpt is then built from the redacted text only.
export function scanSourceFile(
  path: string,
  htmlUrl: string,
  rawText: string,
  maxPromptChars: number,
  options: ExcerptOptions,
): SourceFileScan {
  const scan = redactSecrets(rawText);
  if (scan.status === "dropped") return scan;
  const excerpt = buildExcerpt(path, scan.text, maxPromptChars, options);
  if (!excerpt) return { status: "no_room", redactions: scan.redactions, rules: scan.rules };
  const file = markScanned({ ref: `file:${path}`, path, htmlUrl, rendered: excerpt.rendered, segments: excerpt.segments });
  return { status: "ok", file, excerpt, redactions: scan.redactions, rules: scan.rules };
}

// ---------- repository map ----------

// `htmlUrl`: the file tree at the analyzed commit, for source links; it is not sent to the AI.
export type RepositoryMapEvidence = { ref: "map"; text: string; htmlUrl: string };

// The map is built from file and dependency names (repository text), so it
// is scanned like everything else; a map that would have to be withheld is
// left out.
export function scanRepositoryMap(text: string, htmlUrl: string): Scanned<RepositoryMapEvidence> | null {
  const scan = redactSecrets(text);
  if (scan.status === "dropped") return null;
  return markScanned({ ref: "map" as const, text: scan.text, htmlUrl });
}
