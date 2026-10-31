// Rule-based relevance of a GitHub result to the user's idea: no AI.
// Two separate uses:
// - `relevant`: leaves out clearly unrelated results. Deliberately lenient:
//   keywords count in the name, topics, description and README, with simple
//   word-form matching, and AI-refined search queries add related words.
// - `score`: orders the kept results, closest match first. The user's own
//   words count fully and AI-refined words half, and two of the user's
//   keywords appearing together ("study planner") add a bonus.
import { extractKeywords } from "./searchQuery.js";

export type RelevanceInput = {
  name: string;
  description: string | null;
  topics: string[];
  // null when the README is unknown (not fetched); "" when there is none.
  readme: string | null;
};

export type IdeaTerms = {
  // weight 1: the user's own words; 0.5: words only from AI-refined queries.
  keywords: { word: string; weight: number }[];
  // Consecutive pairs of the user's keywords, in their order.
  phrases: [string, string][];
};

export type Relevance = { score: number; matched: string[]; relevant: boolean };

// How much of a README is searched for keywords.
const README_CHARS = 20_000;
// Where a keyword is found: the strongest place counts.
const WEIGHTS = { name: 3, topics: 3, description: 2, readme: 1 } as const;
const USER_WEIGHT = 1;
const REFINED_WEIGHT = 0.5;
const PHRASE_BONUS = 2;

// Simple word forms: "planners" ~ "planner", "studies" ~ "study", "tracking" ~ "track".
export function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  return w;
}

// Words of a text in order, split at non-letters and camelCase ("StudyPlanner" → study, planner).
function wordList(text: string): string[] {
  const spaced = text.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1).map(stem);
}

// The idea's terms: the user's own words, plus those of the queries actually
// sent to GitHub (which may hold AI-refined, related words).
export function ideaTerms(query: string, githubQueries: string[]): IdeaTerms {
  const own = [...new Set(extractKeywords(query).map(stem))].filter((k) => k.length > 1);
  const refined = [...new Set(githubQueries.flatMap((q) => extractKeywords(q)).map(stem))].filter((k) => k.length > 1 && !own.includes(k));
  return {
    keywords: [...own.map((word) => ({ word, weight: USER_WEIGHT })), ...refined.map((word) => ({ word, weight: REFINED_WEIGHT }))],
    phrases: own.slice(1).map((word, i) => [own[i], word]),
  };
}

const hasPhrase = (words: string[], [a, b]: [string, string]) => words.some((word, i) => word === a && words[i + 1] === b);

export function scoreRelevance(terms: IdeaTerms, repo: RelevanceInput): Relevance {
  if (terms.keywords.length === 0) return { score: 0, matched: [], relevant: true };
  const nameWords = wordList(repo.name);
  const descriptionWords = wordList(repo.description ?? "");
  const fields = {
    name: new Set(nameWords),
    topics: new Set(repo.topics.flatMap(wordList)),
    description: new Set(descriptionWords),
    readme: new Set(wordList((repo.readme ?? "").slice(0, README_CHARS))),
  };

  let unweighted = 0;
  let score = 0;
  const matched: string[] = [];
  for (const { word, weight } of terms.keywords) {
    let found = 0;
    for (const field of ["name", "topics", "description", "readme"] as const) {
      if (fields[field].has(word)) found = Math.max(found, WEIGHTS[field]);
    }
    if (found > 0) matched.push(word);
    unweighted += found;
    score += found * weight;
  }
  for (const phrase of terms.phrases) {
    if (hasPhrase(nameWords, phrase) || hasPhrase(descriptionWords, phrase)) score += PHRASE_BONUS;
  }

  // One keyword in the name, topics or description is enough, or two in the
  // README; for single-word ideas, or when the README could not be read,
  // any match is.
  const threshold = terms.keywords.length === 1 || repo.readme === null ? 1 : 2;
  return { score, matched, relevant: unweighted >= threshold };
}

// Kept results, closest match first: score, then distinct keywords matched,
// then the original (GitHub) order.
export function rankByRelevance<T>(items: { item: T; relevance: Relevance; githubIndex: number }[]): T[] {
  return [...items]
    .sort((a, b) => b.relevance.score - a.relevance.score || b.relevance.matched.length - a.relevance.matched.length || a.githubIndex - b.githubIndex)
    .map((entry) => entry.item);
}
