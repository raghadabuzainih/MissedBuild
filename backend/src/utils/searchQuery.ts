import { createHash } from "node:crypto";

// Filler words that only make GitHub's all-terms matching miss results.
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "not", "of", "to", "in", "on", "for", "with",
  "by", "from", "at", "as", "is", "are", "be", "it", "its", "this", "that",
  "these", "those", "which", "who", "what", "i", "me", "my", "we", "our", "you",
  "your", "he", "she", "him", "her", "his", "they", "them", "their", "us",
  "there", "then", "than", "into", "if", "but", "do", "does", "did", "has",
  "have", "had", "was", "were", "been", "how", "when", "where", "why", "all",
  "also", "just", "very", "more", "most", "other", "such", "way", "get", "lets",
  "want", "would", "like", "need", "looking", "build", "make", "create",
  "develop", "some", "something", "any", "can", "could", "should", "will",
  "helps", "app", "application", "project", "idea", "simple", "about", "using", "so",
]);

// A query this short is searched as-is; anything longer is a description
// that benefits from AI refinement.
const MAX_CLEAR_WORDS = 8;
const MAX_CLEAR_KEYWORDS = 5;
// Used when refinement is unavailable: more terms means fewer GitHub matches.
const FALLBACK_KEYWORDS = 4;

export const EMPTY_QUERY_QUESTION =
  'What should the project do? For example: "study planner for students".';

export type QueryCheck =
  | { kind: "clear"; githubQuery: string }
  | { kind: "vague"; fallbackQuery: string }
  | { kind: "empty" };

export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export function fingerprintQuery(query: string): string {
  return createHash("sha256").update(normalizeQuery(query)).digest("hex");
}

// Plain search terms only. GitHub qualifiers (`user:x`, `stars:>9`), quotes
// and operators in user or AI text are dropped, never passed to GitHub.
export function extractKeywords(text: string): string[] {
  const keywords: string[] = [];
  for (const token of normalizeQuery(text).split(" ")) {
    if (token.includes(":")) continue;
    // Trim surrounding punctuation but keep names like c++, c# and node.js.
    const word = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu, "");
    if (!/^[\p{L}\p{N}][\p{L}\p{N}.+#-]*$/u.test(word)) continue;
    if (STOP_WORDS.has(word) || keywords.includes(word)) continue;
    keywords.push(word);
  }
  return keywords;
}

export function checkQuery(query: string): QueryCheck {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return { kind: "empty" };

  const wordCount = normalizeQuery(query).split(" ").length;
  if (wordCount <= MAX_CLEAR_WORDS && keywords.length <= MAX_CLEAR_KEYWORDS) {
    return { kind: "clear", githubQuery: keywords.join(" ") };
  }
  return { kind: "vague", fallbackQuery: keywords.slice(0, FALLBACK_KEYWORDS).join(" ") };
}
