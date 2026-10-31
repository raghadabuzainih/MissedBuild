// A compact, deterministic map of a repository: its areas (UI, API, data
// model, ...), file counts, main folders, a few file names and the declared
// dependencies. Pure: built from the file list and the manifests already
// read. File names and dependency names are repository text (untrusted data);
// they are cut to a safe length and the map is scanned like other evidence.
import { quoteForPrompt } from "./aiJson.js";
import type { FileDecision, SourceArea } from "./sourceSelection.js";

export const MAP_LIMITS = {
  maxPromptChars: 3_500,
  maxNameChars: 60,
} as const;

// What the map adds to the prompt as {"ref":"map","text":"..."} plus a separator.
export function mapPromptCost(text: string): number {
  return quoteForPrompt({ ref: "map", text }).length + 1;
}

// ---------- dependencies from manifests ----------

const VALID_NAME = /^[@A-Za-z0-9][\w@./:+-]{0,59}$/;

function section(content: string, header: RegExp): string {
  const start = content.search(header);
  if (start === -1) return "";
  const rest = content.slice(start).split("\n").slice(1);
  const end = rest.findIndex((line) => /^\s*\[/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

// Entries of a TOML table, by package name, with their value text. Dotted
// keys (`serde.version = "1"`, `anki.workspace = true`) belong to their package.
function tomlEntries(block: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const m of block.matchAll(/^\s*["']?([A-Za-z0-9_@-]+)((?:\.[A-Za-z0-9_-]+)*)["']?\s*=\s*(.*)$/gm)) {
    const value = m[2] ? `${m[2].slice(1)} = ${m[3]}` : m[3];
    entries.set(m[1], `${entries.get(m[1]) ?? ""} ${value}`.trim());
  }
  return entries;
}

// Internal workspace packages are part of the repository, not external
// dependencies. Only markers that identify them reliably are used.
const LOCAL_SPEC = /^(workspace:|file:|link:|portal:)/;
const isLocalToml = (value: string) => /\bpath\s*=/.test(value) || /\bworkspace\s*=\s*true\b/.test(value);

function jsonDependencies(content: string, field: string): string[] {
  try {
    const value = (JSON.parse(content) as Record<string, unknown>)[field];
    if (!value || typeof value !== "object") return [];
    return Object.entries(value as Record<string, unknown>)
      .filter(([, spec]) => !(typeof spec === "string" && LOCAL_SPEC.test(spec)))
      .map(([name]) => name);
  } catch {
    return [];
  }
}

function cargoDependencies(content: string): string[] {
  const workspace = tomlEntries(section(content, /^\[workspace\.dependencies\]/m));
  const direct = tomlEntries(section(content, /^\[dependencies\]/m));
  const external: string[] = [];
  for (const [name, value] of workspace) if (!/\bpath\s*=/.test(value)) external.push(name);
  for (const [name, value] of direct) {
    if (/\bpath\s*=/.test(value)) continue;
    // `workspace = true` inherits the workspace entry: internal if that one is a path.
    if (/\bworkspace\s*=\s*true\b/.test(value) && /\bpath\s*=/.test(workspace.get(name) ?? "")) continue;
    external.push(name);
  }
  return external;
}

function pyprojectDependencies(content: string): string[] {
  const list = /\bdependencies\s*=\s*\[([\s\S]*?)\]/.exec(content)?.[1] ?? "";
  const found = [...list.matchAll(/["']([A-Za-z0-9][A-Za-z0-9._-]*)/g)].map((m) => m[1]);
  for (const [name, value] of tomlEntries(section(content, /^\[tool\.poetry\.dependencies\]/m))) {
    if (name !== "python" && !/\bpath\s*=/.test(value)) found.push(name);
  }
  // uv workspace members and local paths.
  const local = new Set(
    [...tomlEntries(section(content, /^\[tool\.uv\.sources\]/m))].filter(([, value]) => isLocalToml(value)).map(([name]) => name.toLowerCase()),
  );
  return found.filter((name) => !local.has(name.toLowerCase()));
}

function goDependencies(content: string): string[] {
  const local = new Set([...content.matchAll(/^\s*(?:replace\s+)?(\S+)(?:\s+v\S+)?\s+=>\s+\.\.?\//gm)].map((m) => m[1]));
  return [...content.matchAll(/^\s*(?:require\s+)?([a-z0-9.-]+\.[a-z]{2,}\/[\w./-]+)\s+v\d/gm)]
    .map((m) => m[1])
    .filter((module) => !local.has(module))
    .map((module) => module.split("/").slice(-2).join("/"));
}

// Declared runtime dependencies, by manifest type. Development tools and
// internal workspace packages are left out where the format shows them.
export function parseDependencies(path: string, content: string): string[] {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  let found: string[] = [];
  if (name === "package.json") found = jsonDependencies(content, "dependencies");
  else if (name === "composer.json") found = jsonDependencies(content, "require").filter((n) => n !== "php" && !n.startsWith("ext-"));
  else if (/^requirements[^/]*\.txt$/.test(name)) {
    found = content
      .split("\n")
      .map((line) => /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(line.trim().startsWith("-") ? "" : line)?.[1] ?? "")
      .filter(Boolean);
  } else if (name === "pyproject.toml") found = pyprojectDependencies(content);
  else if (name === "pipfile") {
    found = [...tomlEntries(section(content, /^\[packages\]/m))].filter(([, value]) => !/\bpath\s*=/.test(value)).map(([n]) => n);
  } else if (name === "cargo.toml") found = cargoDependencies(content);
  else if (name === "go.mod") found = goDependencies(content);
  else if (/\.(cs|fs|vb)proj$/.test(name)) found = [...content.matchAll(/<PackageReference\s+Include="([^"]+)"/g)].map((m) => m[1]);
  else if (name === "gemfile") found = [...content.matchAll(/^\s*gem\s+["']([^"']+)["'](?![^\n]*\bpath:)/gm)].map((m) => m[1]);
  else if (name === "pom.xml") found = [...content.matchAll(/<dependency>[\s\S]*?<artifactId>([^<]+)<\/artifactId>/g)].map((m) => m[1]);
  else if (/^build\.gradle(\.kts)?$/.test(name)) {
    found = [...content.matchAll(/\b(?:implementation|api|compileOnly|runtimeOnly)\s*\(?\s*["'][^:"']+:([^:"']+)/g)].map((m) => m[1]);
  } else if (name === "pubspec.yaml") {
    const block = /^dependencies:\s*\n((?:[ \t]+.*\n?)*)/m.exec(content)?.[1] ?? "";
    found = [...block.matchAll(/^ {2}([A-Za-z0-9_]+):/gm)].map((m) => m[1]).filter((n) => n !== "flutter");
  } else if (name === "gemspec" || name.endsWith(".gemspec")) {
    found = [...content.matchAll(/add_(?:runtime_)?dependency\s*\(?\s*["']([^"']+)/g)].map((m) => m[1]);
  }
  return [...new Set(found.filter((n) => VALID_NAME.test(n)))];
}

// ---------- the map ----------

type MapSection = SourceArea | "test" | "docs";

const SECTION_LABEL: Record<MapSection, string> = {
  ui: "Frontend / UI",
  api: "Backend / API",
  data: "Data model / database",
  domain: "Core logic",
  entry: "Entry points",
  test: "Tests",
  docs: "Documentation",
};
const SECTION_ORDER: MapSection[] = ["ui", "api", "data", "domain", "entry", "test", "docs"];

const LANGUAGES: [RegExp, string][] = [
  [/\.(ts|tsx|mts|cts)$/i, "TypeScript"],
  [/\.(js|jsx|mjs|cjs)$/i, "JavaScript"],
  [/\.py$/i, "Python"],
  [/\.go$/i, "Go"],
  [/\.rs$/i, "Rust"],
  [/\.java$/i, "Java"],
  [/\.kts?$/i, "Kotlin"],
  [/\.cs$/i, "C#"],
  [/\.(razor|cshtml)$/i, "Razor"],
  [/\.rb$/i, "Ruby"],
  [/\.php$/i, "PHP"],
  [/\.swift$/i, "Swift"],
  [/\.dart$/i, "Dart"],
  [/\.vue$/i, "Vue"],
  [/\.svelte$/i, "Svelte"],
  [/\.(c|h)$/i, "C"],
  [/\.(cc|cpp|cxx|hpp)$/i, "C++"],
  [/\.sql$/i, "SQL"],
  [/\.exs?$/i, "Elixir"],
  [/\.scala$/i, "Scala"],
];

// Control characters out, long names cut: names are untrusted repository text.
const safe = (name: string) => {
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, " ");
  return clean.length > MAP_LIMITS.maxNameChars ? `${clean.slice(0, MAP_LIMITS.maxNameChars - 1)}…` : clean;
};
const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
// Folders are grouped at most three levels deep.
const folderOf = (path: string) => {
  const parts = path.split("/").slice(0, -1);
  return parts.length === 0 ? "(root)" : `${parts.slice(0, 3).join("/")}/`;
};

function topFolders(files: FileDecision[], count: number): string {
  const counts = new Map<string, number>();
  for (const file of files) counts.set(folderOf(file.path), (counts.get(folderOf(file.path)) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, count)
    .map(([folder, n]) => `${safe(folder)} (${n})`)
    .join(", ");
}

// Entry points and routing files first, then the largest files.
function importantNames(files: FileDecision[], count: number): string[] {
  const rank = (f: FileDecision) => (f.role === "entry" ? 0 : f.role === "routing" ? 1 : 2);
  const sorted = [...files].sort((a, b) => rank(a) - rank(b) || b.size - a.size || (a.path < b.path ? -1 : 1));
  const names: string[] = [];
  for (const file of sorted) {
    const name = safe(baseName(file.path));
    if (!names.includes(name)) names.push(name);
    if (names.length === count) break;
  }
  return names;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

type Detail = { folders: number; names: number; dependencies: number };
// Tried in order until the map fits its limit.
const DETAIL_LEVELS: Detail[] = [
  { folders: 3, names: 4, dependencies: 20 },
  { folders: 2, names: 3, dependencies: 12 },
  { folders: 2, names: 2, dependencies: 8 },
  { folders: 1, names: 1, dependencies: 5 },
];

function render(decisions: FileDecision[], dependencies: string[], treeTruncated: boolean, detail: Detail): string[] {
  const lines = [
    `[repository map generated by MissedBuild from the file list at the analyzed commit: ${plural(decisions.length, "file")}${treeTruncated ? ", GitHub listed only part of them" : ""}. It shows what exists, not whether it works.]`,
  ];

  for (const sectionName of SECTION_ORDER) {
    const files = decisions.filter((d) =>
      sectionName === "test" || sectionName === "docs" ? d.category === sectionName : d.category === "core" && d.area === sectionName,
    );
    if (files.length === 0) continue;
    const names = sectionName === "test" || sectionName === "docs" ? [] : importantNames(files, detail.names);
    lines.push(
      `${SECTION_LABEL[sectionName]}: ${plural(files.length, "file")} in ${topFolders(files, detail.folders)}${names.length > 0 ? `; e.g. ${names.join(", ")}` : ""}`,
    );
  }
  for (const missing of ["ui", "api", "data"] as const) {
    if (!decisions.some((d) => d.category === "core" && d.area === missing)) lines.push(`${SECTION_LABEL[missing]}: none found by file name`);
  }

  const config = decisions.filter((d) => d.category === "config");
  const manifests = [...new Set(config.filter((d) => d.role === "manifest").map((d) => safe(baseName(d.path))))];
  const runtime = [...new Set(config.filter((d) => d.role === "runtime" && !/(^|\/)\.env/i.test(d.path)).map((d) => safe(baseName(d.path))))];
  const ci = decisions.filter((d) => /(^|\/)\.github\/workflows\/|(^|\/)\.gitlab-ci\.ya?ml$|(^|\/)\.circleci\//.test(d.path)).length;
  const configParts = [
    manifests.length > 0 ? `manifests: ${manifests.slice(0, 4).join(", ")}${manifests.length > 4 ? ` (+${manifests.length - 4})` : ""}` : "",
    runtime.length > 0 ? `deployment/runtime: ${runtime.slice(0, 4).join(", ")}${runtime.length > 4 ? ` (+${runtime.length - 4})` : ""}` : "",
    ci > 0 ? plural(ci, "CI workflow file") : "",
  ].filter(Boolean);
  if (configParts.length > 0) lines.push(`Configuration / CI: ${configParts.join("; ")}`);

  if (dependencies.length > 0) {
    const shown = dependencies.slice(0, detail.dependencies).map(safe);
    lines.push(`Declared dependencies (from manifests): ${shown.join(", ")}${dependencies.length > shown.length ? ` (+${dependencies.length - shown.length})` : ""}`);
  }

  const languages = new Map<string, number>();
  for (const d of decisions) {
    if (d.category !== "core" && d.category !== "test") continue;
    const language = LANGUAGES.find(([pattern]) => pattern.test(d.path))?.[1];
    if (language) languages.set(language, (languages.get(language) ?? 0) + 1);
  }
  if (languages.size > 0) {
    const top = [...languages.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5);
    lines.push(`Languages (source and test files): ${top.map(([name, n]) => `${name} ${n}`).join(", ")}`);
  }

  const count = (category: string) => decisions.filter((d) => d.category === category).length;
  lines.push(
    `Not read: ${count("dependency")} dependency/vendored, ${count("generated")} generated/build, ${count("lockfile")} lockfiles, ${count("asset")} assets, ${count("other")} other`,
  );
  return lines;
}

export type RepositoryMap = { text: string; promptChars: number };

// The most detailed map that fits MAP_LIMITS.maxPromptChars; as a last
// resort, trailing lines are dropped.
export function buildRepositoryMap(
  decisions: FileDecision[],
  manifests: { path: string; content: string }[],
  options: { treeTruncated: boolean },
): RepositoryMap {
  const dependencies = [...new Set(manifests.flatMap((m) => parseDependencies(m.path, m.content)))];
  for (const detail of DETAIL_LEVELS) {
    const text = render(decisions, dependencies, options.treeTruncated, detail).join("\n");
    if (mapPromptCost(text) <= MAP_LIMITS.maxPromptChars) return { text, promptChars: mapPromptCost(text) };
  }
  const lines = render(decisions, dependencies, options.treeTruncated, DETAIL_LEVELS[DETAIL_LEVELS.length - 1]);
  while (lines.length > 1 && mapPromptCost(lines.join("\n")) > MAP_LIMITS.maxPromptChars) lines.pop();
  let text = lines.join("\n");
  if (mapPromptCost(text) > MAP_LIMITS.maxPromptChars) text = text.slice(0, 200);
  return { text, promptChars: mapPromptCost(text) };
}
