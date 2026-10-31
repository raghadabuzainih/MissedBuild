// Models often wrap JSON in prose or code fences: take the outermost object.
// Returns undefined when there is no parseable object; callers zod-validate.
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

// JSON-encodes untrusted data for a prompt, with "<" escaped so the text
// cannot close the tag the prompt wraps it in.
export function quoteForPrompt(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
