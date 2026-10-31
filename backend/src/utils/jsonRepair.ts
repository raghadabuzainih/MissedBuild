// Narrow repair of AI JSON output, and content-free descriptions of where it
// is broken. Pure. Only two unambiguous mistakes are repaired, each exactly at
// the point where JSON.parse fails:
//   1. an unescaped double quote inside a string ("Shows "today" tasks"),
//      which ends the string early: the quote is escaped, so the words stay
//      exactly the same;
//   2. a missing comma between two complete objects or lists in a list
//      ({...} {...} or [...] [...]).
// Anything else (truncation, wrong brackets, comments, uncertain cases) is
// not repaired. parseIsolatingSection can then leave out one broken top-level
// section when that is unambiguous; otherwise the caller rejects the output.

export type RepairCounts = { escapedQuotes: number; insertedCommas: number };
export type RepairResult = { value: unknown; repairs: RepairCounts };

// More corrections than this means the output is too broken to trust.
export const MAX_REPAIRS = 10;

const AFTER_ARRAY_ELEMENT = /^Expected ',' or '\]' after array element in JSON at position (\d+)/;
const AFTER_PROPERTY_VALUE = /^Expected ',' or '\}' after property value in JSON at position (\d+)/;
// A literal that could be a value after a missing comma, followed by structure.
const LITERAL_VALUE = /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*[,\]}]/;

const isWhitespace = (ch: string | undefined) => ch === " " || ch === "\n" || ch === "\r" || ch === "\t";

// After a real closing quote, JSON allows only whitespace and , : } ]. Any
// other character means the quote was part of the text. Not when it could be
// a value after a missing comma (a string, object, list, or a literal such as
// true or 12 followed by structure): that case is uncertain.
function continuesText(text: string, position: number): boolean {
  const ch = text[position];
  if (ch === undefined || isWhitespace(ch) || ',:}]"{['.includes(ch)) return false;
  return !LITERAL_VALUE.test(text.slice(position, position + 40));
}

function previousNonWhitespace(text: string, before: number): number {
  let i = before - 1;
  while (i >= 0 && isWhitespace(text[i])) i--;
  return i;
}

// A quote at `index` is escaped when an odd number of backslashes precede it.
function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) backslashes++;
  return backslashes % 2 === 1;
}

type Fix = { kind: "quote" | "comma"; text: string };

// One fix at the failure position, or null when the case is not unambiguous.
function fixAt(text: string, message: string): Fix | null {
  const element = AFTER_ARRAY_ELEMENT.exec(message);
  const property = AFTER_PROPERTY_VALUE.exec(message);
  const position = Number((element ?? property)?.[1] ?? NaN);
  if (!Number.isInteger(position)) return null;

  const here = text[position];
  const before = previousNonWhitespace(text, position);
  const prev = text[before];

  // 1. A string ended early at an unescaped quote and the text continues:
  // ..."Shows "today" ... fails at "t" right after the quote.
  if (prev === '"' && !isEscaped(text, before) && continuesText(text, position)) {
    return { kind: "quote", text: `${text.slice(0, before)}\\"${text.slice(before + 1)}` };
  }

  // 2. Two complete objects or lists in a list with no comma between them:
  // } {  or  ] [. Two strings ("a" "b") are left alone: that could also be a
  // doubled quote inside text.
  if (element && (prev === "}" || prev === "]") && (here === "{" || here === "[")) {
    return { kind: "comma", text: `${text.slice(0, before + 1)},${text.slice(before + 1)}` };
  }
  return null;
}

type Attempt =
  | { ok: true; value: unknown; repairs: RepairCounts }
  // Where the narrow repair got stuck: the text with the repairs made so far,
  // and JSON.parse's message for it.
  | { ok: false; text: string; message: string; repairs: RepairCounts };

function repairAndParse(text: string, start: RepairCounts = { escapedQuotes: 0, insertedCommas: 0 }): Attempt {
  const repairs = { ...start };
  let current = text;
  for (;;) {
    try {
      return { ok: true, value: JSON.parse(current), repairs };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const fix = repairs.escapedQuotes + repairs.insertedCommas < MAX_REPAIRS ? fixAt(current, message) : null;
      if (!fix) return { ok: false, text: current, message, repairs };
      current = fix.text;
      if (fix.kind === "quote") repairs.escapedQuotes++;
      else repairs.insertedCommas++;
    }
  }
}

// Parses `text`, repairing at most MAX_REPAIRS unambiguous mistakes. Null when
// it cannot be parsed without guessing. Valid JSON comes back with no repairs.
export function parseWithRepair(text: string): RepairResult | null {
  const attempt = repairAndParse(text);
  return attempt.ok ? { value: attempt.value, repairs: attempt.repairs } : null;
}

// ---------- leaving out one broken top-level section ----------

export type IsolationResult = RepairResult & { isolated: string };

type Member = { key: string; keyStart: number };

// The top-level members of an object text scanned up to `end`, and the member
// whose value `end` is in (null between members). Only meaningful over text
// that JSON.parse accepted up to `end`.
function scanTopLevel(text: string, end: number): { members: Member[]; openMember: Member | null } {
  const members: Member[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let keyStart = -1;
  let expectingKey = false;
  let buffer = "";
  let open: Member | null = null;
  for (let i = 0; i < Math.min(end, text.length); i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') {
        inString = false;
        if (keyStart !== -1) {
          open = { key: buffer, keyStart };
          members.push(open);
          keyStart = -1;
        }
      } else if (keyStart !== -1) buffer += ch;
      continue;
    }
    if (ch === '"') {
      inString = true;
      if (depth === 1 && expectingKey) {
        keyStart = i;
        buffer = "";
      }
    } else if (ch === "{" || ch === "[") {
      depth++;
      if (depth === 1) expectingKey = true;
    } else if (ch === "}" || ch === "]") depth--;
    else if (depth === 1 && ch === ",") {
      expectingKey = true;
      open = null;
    } else if (depth === 1 && ch === ":") expectingKey = false;
  }
  return { members, openMember: depth >= 1 && !expectingKey ? open : null };
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// When the narrow repair cannot fix an object, tries to leave out the one
// top-level section whose value holds the error, and nothing else. Accepted
// only when the error is inside an `isolatable` section and exactly one way of
// resuming after it (at a later section, or at the closing brace) gives valid
// JSON with every other `expected` key exactly once and no other key. Anything
// else (an error outside those sections, an unexpected end of input, two
// broken sections, a section name appearing twice after the error, an
// ambiguous restart) gives null and the caller rejects the whole output.
// Nothing of the left-out section is kept.
export function parseIsolatingSection(text: string, expected: readonly string[], isolatable: ReadonlySet<string>): IsolationResult | null {
  const first = repairAndParse(text);
  if (first.ok) return null; // Nothing to isolate.
  const position = Number(/at position (\d+)/.exec(first.message)?.[1] ?? NaN);
  // No position, or the end of the input: a cut-off output is never isolated.
  if (!Number.isInteger(position) || position >= first.text.trimEnd().length - 1) return null;

  const broken = first.text;
  const { members, openMember } = scanTopLevel(broken, position);
  if (!openMember || !isolatable.has(openMember.key)) return null;
  // Before the broken section: only expected keys, once each.
  const before = members.slice(0, -1).map((m) => m.key);
  if (before.some((key) => !expected.includes(key)) || new Set(before).size !== before.length) return null;

  // The prefix without the broken section and the comma before it.
  let head = broken.slice(0, openMember.keyStart).trimEnd();
  const isFirst = head.endsWith("{");
  if (!isFirst) {
    if (!head.endsWith(",")) return null;
    head = head.slice(0, -1);
  }

  const wanted = expected.filter((key) => key !== openMember.key);
  const later = wanted.filter((key) => !before.includes(key));
  const starts: number[] = [];
  if (later.length > 0) {
    const pattern = new RegExp(`"(?:${later.map(escapeRegExp).join("|")})"\\s*:`, "g");
    pattern.lastIndex = position;
    // A later section starts after a comma that ends the broken value.
    const seen = new Set<string>();
    for (let match = pattern.exec(broken); match; match = pattern.exec(broken)) {
      if (broken[previousNonWhitespace(broken, match.index)] !== ",") continue;
      // The same section name twice: either could be the real start, so neither is used.
      if (seen.has(match[0])) return null;
      seen.add(match[0]);
      starts.push(match.index);
    }
  }
  // Or the broken section is the last one: resume at the closing brace.
  const closing = broken.trimEnd().length - 1;
  if (broken[closing] === "}") starts.push(closing);

  const accepted: IsolationResult[] = [];
  for (const start of starts) {
    const joined = start === closing ? `${head}}` : `${head}${isFirst ? "" : ","}${broken.slice(start)}`;
    const attempt = repairAndParse(joined, first.repairs);
    if (!attempt.ok || typeof attempt.value !== "object" || attempt.value === null || Array.isArray(attempt.value)) continue;
    // Every other expected key exactly once (JSON.parse keeps only the last of a duplicate).
    const keys = scanTopLevel(joined, joined.length).members.map((m) => m.key);
    if (keys.length !== wanted.length || new Set(keys).size !== keys.length || wanted.some((key) => !keys.includes(key))) continue;
    accepted.push({ value: attempt.value, repairs: attempt.repairs, isolated: openMember.key });
  }
  return accepted.length === 1 ? accepted[0] : null;
}

// ---------- content-free descriptions of a failure point ----------

// What kind of character is at a position, without the character itself.
export function characterClass(ch: string | undefined): string {
  if (ch === undefined) return "end of output";
  if (isWhitespace(ch)) return "whitespace";
  if (/\p{L}/u.test(ch)) return "letter";
  if (/\p{N}/u.test(ch)) return "digit";
  const named: Record<string, string> = {
    '"': "double quote",
    "'": "single quote",
    "{": "opening brace",
    "}": "closing brace",
    "[": "opening bracket",
    "]": "closing bracket",
    ":": "colon",
    ",": "comma",
    "\\": "backslash",
  };
  return named[ch] ?? "other punctuation";
}

// The JSON path (e.g. projectIdeas[1].toBuild[2]) at `position`. Only field
// names in `knownKeys` are shown; any other key, which could be model text,
// appears as "<key>".
export function jsonPathAt(text: string, position: number, knownKeys: ReadonlySet<string>): string {
  type Frame = { type: "object"; key: string | null; expectingKey: boolean } | { type: "array"; index: number };
  const stack: Frame[] = [];
  let inString = false;
  let escaped = false;
  let stringIsKey = false;
  let buffer = "";

  for (let i = 0; i < Math.min(position, text.length); i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') {
        inString = false;
        const top = stack.at(-1);
        if (stringIsKey && top?.type === "object") top.key = buffer;
      } else if (stringIsKey && buffer.length < 60) buffer += ch;
      continue;
    }
    const top = stack.at(-1);
    if (ch === '"') {
      inString = true;
      stringIsKey = top?.type === "object" && top.expectingKey;
      buffer = "";
    } else if (ch === "{") stack.push({ type: "object", key: null, expectingKey: true });
    else if (ch === "[") stack.push({ type: "array", index: 0 });
    else if (ch === "}" || ch === "]") stack.pop();
    else if (ch === ",") {
      if (top?.type === "array") top.index++;
      else if (top?.type === "object") top.expectingKey = true;
    } else if (ch === ":" && top?.type === "object") top.expectingKey = false;
  }

  let path = "";
  stack.forEach((frame, depth) => {
    if (frame.type === "array") path += `[${frame.index}]`;
    // An object contributes the key whose value the position is in (none
    // while the innermost object is between fields).
    else if (frame.key !== null && !(depth === stack.length - 1 && frame.expectingKey)) {
      path += `${path ? "." : ""}${knownKeys.has(frame.key) ? frame.key : "<key>"}`;
    }
  });
  return path || "(root)";
}
