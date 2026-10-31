// The analysis prompt version, on its own so lists can tell current analyses
// from earlier ones without loading the AI services.
// Part of the cache key: bump it whenever the prompt or result rules change.
// v2: source files as evidence, file sources, stricter untrusted-data rules.
// v3: repository map; user value first (project ideas, functional extensions,
// technical improvements); verified gaps; open and closed issues kept apart.
// v4: explicit JSON formatting rules (escaping, no line breaks in strings).
export const ANALYSIS_PROMPT_VERSION = "analysis-v4";
