// Rule-based choice of source files to use as analysis evidence. Pure: it
// works on the tree listing only (paths, sizes, blob SHAs), with no AI and no
// network. Every file gets a category and a reason, selected or not.
import type { GitHubTreeFile } from "../types/github.js";
import { estimatePromptCost } from "./fileExcerpt.js";

export const SOURCE_FILE_CATEGORIES = [
  "core",
  "config",
  "test",
  "docs",
  "dependency",
  "generated",
  "lockfile",
  "asset",
  "other",
] as const;
export type SourceFileCategory = (typeof SOURCE_FILE_CATEGORIES)[number];
export type SourceFileRole =
  | "manifest" // config: stack, dependencies, scripts
  | "runtime" // config: deployment/runtime settings, never sent
  | "tooling" // config: CI, editor, linters, never sent
  | "entry"
  | "routing"
  | "domain"
  | "source"
  | "maintenance" // other: repository scripts and benchmarks
  | null;

// Project areas, in the order they receive budget. A file's area comes from
// its path and name (see areaOf).
export const SOURCE_AREAS = ["data", "api", "ui", "domain", "entry"] as const;
export type SourceArea = (typeof SOURCE_AREAS)[number];

// Character limits are prompt characters: everything a file adds to the
// prompt, including our markers, labels and JSON encoding (filePromptCost).
export const SOURCE_LIMITS = {
  // Source evidence in total, repository map included.
  totalChars: 40_000,
  // Kept for the repository map when planning; its real cost is measured.
  mapReserveChars: 3_500,
  perFileChars: 6_000,
  // A file read only as its declaration lines.
  outlineOnlyChars: 1_200,
  // Bounds the GitHub requests per analysis, whatever the file sizes.
  maxFiles: 25,
  perManifestChars: 2_500,
  maxManifests: 2,
  // Budget per area; an area without files passes its share on.
  areaChars: { data: 6_000, api: 6_000, ui: 6_000, domain: 8_000, entry: 4_000 } satisfies Record<SourceArea, number>,
  // Share of an area's budget for its one file read in depth; the rest is outlines.
  deepShare: 0.6,
  // The file read in depth should have real content when the area has such a file.
  minDeepBytes: 1_500,
  // Smaller core files are usually stubs or re-exports.
  minFileBytes: 200,
  // Larger "source" files are usually bundled or generated. Large hand-written
  // files exist (FastAPI's routing.py is over 200 KB), and only the start of a
  // file is read anyway.
  maxFileBytes: 1_000_000,
  // Copies of one app in two folders (e.g. server/ and wasm/) differ slightly.
  nearDuplicateSizeRatio: 0.05,
  // Below this, the remaining budget would only buy a fragment.
  minUsefulChars: 1_500,
} as const;

export type FileDecision = GitHubTreeFile & {
  category: SourceFileCategory;
  role: SourceFileRole;
  // Core source only: the project area it belongs to.
  area: SourceArea | null;
  // Why the file got its category.
  classification: string;
  selected: boolean;
  // Why it was selected, excluded or left out.
  reason: string;
};

// "deep": the whole file, or its start plus declarations. "outline": its
// declaration lines only (or the whole file when that is smaller).
export type ReadMode = "deep" | "outline";

export type SelectedSourceFile = {
  path: string;
  sha: string;
  size: number;
  category: SourceFileCategory;
  role: SourceFileRole;
  area: SourceArea | "manifest" | "fallback";
  mode: ReadMode;
  reason: string;
  // Upper limit for this file's prompt characters when it is read.
  maxChars: number;
  // Its share of the plan, estimated from the byte size; the real cost is
  // measured after fetching.
  plannedChars: number;
};

export type CategoryTotals = Record<SourceFileCategory, { files: number; bytes: number }>;

export type SourceSelection = {
  files: SelectedSourceFile[];
  // Candidates for a second pass, in order; used only if budget is left after reading.
  reserve: SelectedSourceFile[];
  plannedChars: number;
  // Every file that was not selected, by category.
  excluded: CategoryTotals;
  // One decision per file. For tests and debugging; not meant to be stored.
  decisions: FileDecision[];
};

export type SelectionContext = {
  repoName: string;
  // GitHub's primary language for the repository.
  language: string | null;
  readme: string | null;
};

// ---------- classification ----------

// A directory segment anywhere in the path, case-insensitive.
const dirs = (names: string) => new RegExp(`(^|/)(${names})/`, "i");

const CODE_EXTENSIONS =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|kts|scala|groovy|cs|fs|vb|razor|cshtml|rb|php|swift|m|mm|c|cc|cpp|cxx|h|hpp|vue|svelte|astro|dart|ex|exs|erl|clj|cljs|hs|ml|lua|r|jl|zig|nim|sql|sh|ps1|graphql|gql|proto|prisma)$/i;
// API descriptions are data, not code, but say a lot about what an app offers.
const API_SPEC = /(^|\/)(openapi|swagger)[^/]*\.(json|ya?ml)$/i;

type Rule = { category: SourceFileCategory; role: SourceFileRole; reason: string; test: (path: string) => boolean };

// Checked in order; the first match wins. Order matters: package-lock.json is a
// lockfile before any manifest rule sees it, and a package.json inside docs/ is
// documentation.
const RULES: Rule[] = [
  {
    category: "dependency",
    role: null,
    reason: "dependency / third-party directory",
    test: (p) =>
      dirs("node_modules|bower_components|jspm_packages|vendor|third[_-]party|external|extern|Pods|Carthage|\\.venv|venv|site-packages|_deps|wwwroot/lib").test(p),
  },
  {
    category: "lockfile",
    role: null,
    reason: "lockfile",
    test: (p) =>
      /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|poetry\.lock|Pipfile\.lock|uv\.lock|pdm\.lock|Cargo\.lock|go\.sum|Gemfile\.lock|composer\.lock|packages\.lock\.json|mix\.lock|pubspec\.lock|Podfile\.lock|flake\.lock|gradle\.lockfile)$/i.test(p),
  },
  {
    // Before everything else that could match: these may hold credentials.
    category: "config",
    role: "runtime",
    reason: "environment or credential file (may contain secrets)",
    test: (p) => /(^|\/)\.env(\.[^/]*)?$/i.test(p) || /\.(pem|key|p12|pfx|jks|keystore)$/i.test(p),
  },
  {
    category: "generated",
    role: null,
    reason: "build directory (output or build tooling, not application code)",
    test: (p) => dirs("build").test(p),
  },
  {
    category: "generated",
    role: null,
    reason: "build output / generated directory",
    test: (p) =>
      dirs("dist|out|target|bin|obj|\\.next|\\.nuxt|\\.svelte-kit|\\.output|coverage|__pycache__|\\.gradle|\\.angular|generated|__generated__|gen").test(p),
  },
  { category: "generated", role: null, reason: "minified file or source map", test: (p) => /\.(min\.(js|mjs|css)|map)$/i.test(p) },
  {
    category: "generated",
    role: null,
    reason: "generated-code naming pattern",
    test: (p) =>
      /(\.pb\.go|_pb2(_grpc)?\.pyi?|\.pb\.(cc|h)|\.g\.dart|\.freezed\.dart|\.generated\.\w+|\.designer\.cs|\.g\.cs|\.g\.i\.cs|ModelSnapshot\.cs)$/i.test(p),
  },
  {
    category: "generated",
    role: null,
    reason: "schema migrations (mostly generated)",
    test: (p) => dirs("migrations|alembic/versions|db/migrate").test(p),
  },
  {
    category: "asset",
    role: null,
    reason: "binary / media file",
    test: (p) =>
      /\.(png|jpe?g|gif|bmp|ico|icns|svg|webp|avif|tiff?|psd|woff2?|ttf|otf|eot|mp[34]|wav|ogg|webm|mov|avi|flac|pdf|zip|gz|tgz|bz2|xz|7z|rar|jar|war|dll|exe|so|dylib|a|lib|o|class|pyc|wasm|bin|dat|db|sqlite3?|nupkg|apk|ipa|dmg)$/i.test(p),
  },
  { category: "asset", role: null, reason: "stylesheet", test: (p) => /\.(css|scss|sass|less|styl)$/i.test(p) },
  {
    category: "asset",
    role: null,
    reason: "translation strings",
    test: (p) => dirs("locales?|i18n|translations|lang").test(p) && /\.(json|ya?ml|po|ftl|properties|xlf|resx)$/i.test(p),
  },
  {
    category: "test",
    role: null,
    reason: "test directory",
    test: (p) =>
      dirs("tests?|__tests__|spec|specs|e2e|cypress|playwright|testdata|test-data|fixtures|__mocks__|testing|[^/]+\\.Tests?|[^/]+\\.UnitTests").test(p),
  },
  {
    category: "test",
    role: null,
    reason: "test file naming pattern",
    test: (p) =>
      /(_test\.go|(^|\/)test_[^/]+\.py|_test\.py|\.(test|spec)\.[cm]?[jt]sx?|Tests?\.(cs|java|kt)|_spec\.rb|_test\.rb|(^|\/)conftest\.py|(^|\/)setupTests?\.[cm]?[jt]sx?|(^|\/)(jest|vitest)\.setup\.[cm]?[jt]sx?|(^|\/)test[-_]?(utils?|helpers?)\.[cm]?[jt]sx?)$/.test(p),
  },
  {
    category: "docs",
    role: null,
    reason: "documentation / example directory",
    test: (p) => dirs("docs?|documentation|dev-docs|docs-site|website|examples?|samples?|demos?|tutorials?|docs_src").test(p),
  },
  {
    category: "docs",
    role: null,
    reason: "documentation file",
    test: (p) => /\.(md|mdx|rst|adoc|txt|rtf)$/i.test(p) && !/(^|\/)requirements[^/]*\.txt$/i.test(p),
  },
  {
    category: "docs",
    role: null,
    reason: "license / changelog / project meta",
    test: (p) => /(^|\/)(LICEN[CS]E|COPYING|NOTICE|AUTHORS|CHANGELOG|CHANGES|HISTORY|CODEOWNERS)[^/]*$/i.test(p),
  },
  {
    category: "config",
    role: "manifest",
    reason: "project manifest (stack, dependencies, scripts)",
    test: (p) =>
      /(^|\/)(package\.json|pyproject\.toml|setup\.py|setup\.cfg|requirements[^/]*\.txt|Pipfile|environment\.ya?ml|go\.mod|Cargo\.toml|[^/]+\.(csproj|fsproj|vbproj)|pom\.xml|build\.gradle(\.kts)?|Gemfile|[^/]+\.gemspec|composer\.json|mix\.exs|pubspec\.yaml|Package\.swift|CMakeLists\.txt|deno\.jsonc?)$/i.test(p),
  },
  {
    category: "config",
    role: "runtime",
    reason: "runtime / deployment config",
    test: (p) =>
      /(^|\/)(Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|compose\.ya?ml|Procfile|appsettings[^/]*\.json|launchSettings\.json|next\.config\.[cm]?[jt]s|nuxt\.config\.[jt]s|angular\.json|vercel\.json|netlify\.toml|app\.ya?ml|serverless\.ya?ml|fly\.toml)$/i.test(p),
  },
  {
    category: "config",
    role: "tooling",
    reason: "tooling / CI / editor config",
    test: (p) =>
      dirs("\\.github|\\.gitlab|\\.circleci|\\.vscode|\\.idea|\\.devcontainer|\\.husky|\\.cargo|\\.cursor|\\.config").test(p) ||
      /(^|\/)\.[^/]+\.[cm]?[jt]s$/.test(p) ||
      /(^|\/)(tsconfig[^/]*\.json|jsconfig\.json|\.?eslint[^/]*|\.prettier[^/]*|\.babelrc[^/]*|babel\.config\.[^/]+|(vite|vitest|webpack|rollup|jest|tailwind|postcss|svelte|karma|playwright|cypress|drizzle)\.config\.[^/]+|\.editorconfig|\.gitignore|\.gitattributes|\.gitmodules|\.npmrc|\.nvmrc|\.node-version|\.python-version|\.dockerignore|Makefile|justfile|tox\.ini|pytest\.ini|\.flake8|mypy\.ini|ruff\.toml|\.pre-commit-config\.yaml|global\.json|nuget\.config|Directory\.[^/]+\.props|[^/]+\.sln|settings\.gradle(\.kts)?|rustfmt\.toml|clippy\.toml|\.?renovate\.json|dependabot\.yml|\.yarnrc[^/]*|lerna\.json|turbo\.json|nx\.json|pnpm-workspace\.yaml|\.browserslistrc|\.stylelintrc[^/]*|_Imports\.razor|_ViewImports\.cshtml|_ViewStart\.cshtml)$/i.test(p),
  },
  {
    category: "other",
    role: "maintenance",
    reason: "repository maintenance / benchmark scripts",
    test: (p) => dirs("scripts|tools|hack|\\.ci|ci|dev-tools|benchmarks?|bench").test(p),
  },
  { category: "other", role: null, reason: "type declarations only", test: (p) => /\.d\.[cm]?ts$/i.test(p) },
  { category: "core", role: "source", reason: "source file", test: (p) => CODE_EXTENSIONS.test(p) || API_SPEC.test(p) },
];

const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const dirName = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const depth = (path: string) => path.split("/").length;

// Always entry points, wherever they sit.
const ENTRY_NAMES =
  /^(main|app|server|program|startup|cli|__main__|manage|wsgi|asgi|applications?|bootstrap)\.\w+$|Application\.(java|kt)$/i;
// Module files that only count as entry points at a package root; deeper
// ones are usually re-exports (index.ts, mod.rs, __init__.py).
const PACKAGE_ROOT_NAMES = /^(index|mod|lib|__init__)\.\w+$/i;
const ROUTING =
  /(^|\/)(routes?|routers?|routing|controllers?|handlers?|endpoints?|api|views|pages|urls)(\/|\.\w+$)|Controller\.(cs|java|kt|php|rb)$|(^|\/)app\/(.+\/)?(page|route|layout)\.[jt]sx?$/i;
const DOMAIN =
  /(^|\/)(services?|models?|entities|entity|domain|schemas?|store|stores|state|hooks|core|repositories|repository|usecases|components|lib|internal|pkg|features|modules|utils?|helpers)\//i;

function isPackageRoot(dir: string): boolean {
  return (
    dir === "" ||
    !dir.includes("/") ||
    /(^|\/)src$/.test(dir) ||
    /^(packages|apps|libs|crates|modules|services)\/[^/]+$/.test(dir)
  );
}

function coreRole(path: string): SourceFileRole {
  const name = fileName(path);
  if (ENTRY_NAMES.test(name) || (PACKAGE_ROOT_NAMES.test(name) && isPackageRoot(dirName(path)))) return "entry";
  if (ROUTING.test(path)) return "routing";
  if (DOMAIN.test(path)) return "domain";
  return "source";
}

// Path and name rules for project areas, checked in this order (entry points
// first, then API before UI, so that Next.js pages/api/ is API).
const API_PATH =
  /(^|\/)(routes?|routers?|routing|controllers?|handlers?|endpoints?|api|urls|views\.py|resolvers?|graphql)(\/|\.\w+$|$)|Controller\.(cs|java|kt|php|rb)$|(^|\/)app\/(.+\/)?route\.[jt]sx?$/i;
// Server code even inside a pages/routes folder (Next.js pages/api, SvelteKit +server).
const SERVER_ROUTE = /(^|\/)(api|controllers?|handlers?|endpoints?)\/|(^|\/)\+server\.[jt]s$|(^|\/)route\.[jt]sx?$/i;
const UI_EXTENSION = /\.(tsx|jsx|vue|svelte|astro|razor|cshtml|html|dart|swift)$/i;
const DATA_PATH =
  /(^|\/)(models?|entities|entity|schemas?|db|database|prisma|orm|repositories|repository|dao|dto|migrations|types)(\/|\.\w+$)|(^|\/)types?\.(ts|tsx)$|\.(prisma|sql|graphql|gql|proto)$/i;
// Folder names only: a file called view.js or template.rs is not necessarily UI.
const UI_PATH =
  /(^|\/)(components?|pages|views?|screens?|layouts?|widgets?|ui|templates?|frontend|client|web|android|ios|mobile|desktop|electron)\/|(^|\/)app\/(.+\/)?(page|layout)\.[jt]sx?$/i;

export function areaOf(path: string, role: SourceFileRole): SourceArea {
  if (role === "entry") return "entry";
  // Route folders of UI frameworks (SvelteKit, Remix, Next.js) hold pages.
  if (UI_EXTENSION.test(path) && !SERVER_ROUTE.test(path)) return "ui";
  if (API_PATH.test(path) || API_SPEC.test(path)) return "api";
  if (DATA_PATH.test(path)) return "data";
  if (UI_PATH.test(path) || UI_EXTENSION.test(path)) return "ui";
  return "domain";
}

export type Classification = { category: SourceFileCategory; role: SourceFileRole; area: SourceArea | null; classification: string };

export function classifyFile(file: GitHubTreeFile): Classification {
  const rule = RULES.find((r) => r.test(file.path));
  if (!rule) return { category: "other", role: null, area: null, classification: "unrecognized file type (data, YAML, misc)" };
  if (rule.category !== "core") return { category: rule.category, role: rule.role, area: null, classification: rule.reason };
  if (file.size > SOURCE_LIMITS.maxFileBytes) {
    return { category: "generated", role: null, area: null, classification: "source file over 1 MB (likely bundled or generated)" };
  }
  const role = coreRole(file.path);
  return { category: "core", role, area: areaOf(file.path, role), classification: "source file" };
}

// ---------- ranking and selection ----------

const ROLE_WEIGHT: Partial<Record<NonNullable<SourceFileRole>, number>> = { entry: 100, routing: 80, domain: 60, source: 40 };
const ROLE_LABEL: Partial<Record<NonNullable<SourceFileRole>, string>> = {
  entry: "entry point",
  routing: "routing",
  domain: "domain module",
  source: "source file",
};

// GitHub language → extensions that count as that language.
const LANGUAGE_EXTENSIONS: Record<string, RegExp> = {
  TypeScript: /\.(ts|tsx|mts|cts)$/i,
  JavaScript: /\.(js|jsx|mjs|cjs)$/i,
  Python: /\.py$/i,
  Go: /\.go$/i,
  Rust: /\.rs$/i,
  Java: /\.java$/i,
  Kotlin: /\.kts?$/i,
  Scala: /\.scala$/i,
  "C#": /\.(cs|razor|cshtml)$/i,
  // Blazor/Razor projects are often reported as HTML.
  HTML: /\.(razor|cshtml)$/i,
  Ruby: /\.rb$/i,
  PHP: /\.php$/i,
  Swift: /\.swift$/i,
  "Objective-C": /\.(m|mm|h)$/i,
  C: /\.(c|h)$/i,
  "C++": /\.(cc|cpp|cxx|h|hpp)$/i,
  Dart: /\.dart$/i,
  Elixir: /\.exs?$/i,
  Vue: /\.vue$/i,
  Svelte: /\.svelte$/i,
  Lua: /\.lua$/i,
  Shell: /\.sh$/i,
};

// Spreading picks: each file already taken from the same directory, or the
// same package (see packageOf), lowers the next candidate's score.
const SAME_DIR_PENALTY = 20;
const SAME_PACKAGE_PENALTY = 15;

type Candidate = { file: FileDecision; score: number; why: string[] };

const STRONG_DATA = /(^|\/)(models?|entities|entity|schemas?|prisma|db|database|migrations)(\/|\.\w+$)|\.(prisma|sql|proto|graphql|gql)$/i;
const COMPONENT_LOCAL = /(^|\/)(components?|hooks|widgets?|dialogs?)\//i;

// A file's package: packages/<name>, apps/<name>, crates/<name>, libs/<name>, or its top-level folder.
const packageOf = (path: string) => {
  const parts = path.split("/");
  if (parts.length === 1) return "(root)";
  return /^(packages|apps|libs|crates|modules|services)$/.test(parts[0]) && parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0];
};

function scoreCandidates(core: FileDecision[], context: SelectionContext): Candidate[] {
  const minDepth = Math.min(...core.map((f) => depth(f.path)));
  const languageExtensions = context.language ? LANGUAGE_EXTENSIONS[context.language] : undefined;
  const readme = context.readme?.toLowerCase() ?? "";
  const packageName = context.repoName.toLowerCase().replace(/[-.]/g, "_");

  const packageSizes = new Map<string, number>();
  for (const f of core) packageSizes.set(packageOf(f.path), (packageSizes.get(packageOf(f.path)) ?? 0) + 1);
  const maxPackageSize = Math.max(1, ...packageSizes.values());
  return core.map((file) => {
    const role = file.role as NonNullable<SourceFileRole>;
    let score = ROLE_WEIGHT[role] ?? 40;
    const why: string[] = [ROLE_LABEL[role] ?? "source file"];
    if (languageExtensions?.test(file.path)) {
      score += 20;
      why.push(`primary language (${context.language})`);
    }
    const name = fileName(file.path).toLowerCase();
    if (readme && (readme.includes(file.path.toLowerCase()) || (name.length > 6 && readme.includes(name)))) {
      score += 30;
      why.push("named in the README");
    }
    const parentDirs = dirName(file.path).toLowerCase().replace(/[-.]/g, "_").split("/");
    if (parentDirs.some((d) => d === packageName || d === "src" || d === "lib")) {
      score += 15;
      why.push("main package directory");
    }
    score -= 5 * (depth(file.path) - minDepth);
    // Centrality, from the file list alone.
    // Larger packages are more central: a bonus up to 10 by package size, and
    // a root-module bonus only in packages at least a quarter the size of the largest.
    const pkg = packageOf(file.path);
    // Application packages (the product users run) count as main packages even when small.
    const isAppPackage = /(^|[-_/])(app|apps|web|client|frontend|site|ui)([-_]|$)/i.test(pkg.split("/").pop() ?? "");
    const share = Math.max((packageSizes.get(pkg) ?? 0) / maxPackageSize, isAppPackage ? 0.5 : 0);
    const sizeBonus = Math.round(10 * share);
    if (sizeBonus > 0) {
      score += sizeBonus;
      why.push("in a main package");
    }
    if (isPackageRoot(dirName(file.path)) && share >= 0.25) {
      score += 10;
      why.push("package root module");
    }
    if (file.area === "data") {
      if (STRONG_DATA.test(file.path)) {
        score += 10;
        why.push("data model file");
      }
      if (COMPONENT_LOCAL.test(file.path)) {
        score -= 15;
        why.push("local to one component");
      }
    }
    return { file, score, why };
  });
}

// Same file name in the same kind of folder (last two path segments) and
// almost the same size: most likely a copy with small edits.
function isNearDuplicate(a: GitHubTreeFile, b: GitHubTreeFile): boolean {
  const tail = (path: string) => path.toLowerCase().split("/").slice(-2).join("/");
  if (!a.path.includes("/") || !b.path.includes("/") || tail(a.path) !== tail(b.path)) return false;
  return Math.abs(a.size - b.size) <= SOURCE_LIMITS.nearDuplicateSizeRatio * Math.max(a.size, b.size);
}

function emptyTotals(): CategoryTotals {
  return Object.fromEntries(SOURCE_FILE_CATEGORIES.map((c) => [c, { files: 0, bytes: 0 }])) as CategoryTotals;
}

// UI frameworks with file-based routing (SvelteKit, Remix, Next.js app/)
// keep page loaders and helpers next to the pages. In a routes/ folder that
// holds UI pages, the other files belong to the UI too, unless they are
// server routes.
function assignUiRouteFolders(decisions: FileDecision[]): void {
  const uiRouteRoots = new Set<string>();
  for (const d of decisions) {
    const root = /^(.*?(?:^|\/)routes\/)/.exec(d.path)?.[1];
    if (root && d.category === "core" && UI_EXTENSION.test(d.path)) uiRouteRoots.add(root);
  }
  if (uiRouteRoots.size === 0) return;
  for (const d of decisions) {
    if (d.category !== "core" || d.area !== "api" || SERVER_ROUTE.test(d.path)) continue;
    if ([...uiRouteRoots].some((root) => d.path.startsWith(root))) d.area = "ui";
  }
}

// Second pass: at most this many candidates, and only useful ones.
const RESERVE_SIZE = 8;
const RESERVE_MIN_SCORE = 75;
const RESERVE_MIN_BYTES = 2_000;

const AREA_LABEL: Record<SourceArea, string> = {
  data: "data model",
  api: "API / routes",
  ui: "user interface",
  domain: "core logic",
  entry: "entry point",
};

// Candidates in reading order: by score, but each pick from a directory (or
// package) lowers the next file there, so picks spread out, also across the
// packages of a monorepo.
function diversifiedOrder(candidates: Candidate[]): Candidate[] {
  const perDir = new Map<string, number>();
  const perPackage = new Map<string, number>();
  // Each earlier pick counts once: as same-directory, or else as same package.
  const effective = (c: Candidate) => {
    const sameDir = perDir.get(dirName(c.file.path)) ?? 0;
    const samePackage = (perPackage.get(packageOf(c.file.path)) ?? 0) - sameDir;
    return c.score - SAME_DIR_PENALTY * sameDir - SAME_PACKAGE_PENALTY * samePackage;
  };
  const ordered: Candidate[] = [];
  let remaining = candidates;
  while (remaining.length > 0) {
    let best = remaining[0];
    for (const c of remaining) {
      const diff = effective(c) - effective(best);
      if (diff > 0 || (diff === 0 && c.file.path < best.file.path)) best = c;
    }
    remaining = remaining.filter((c) => c !== best);
    ordered.push(best);
    perDir.set(dirName(best.file.path), (perDir.get(dirName(best.file.path)) ?? 0) + 1);
    perPackage.set(packageOf(best.file.path), (perPackage.get(packageOf(best.file.path)) ?? 0) + 1);
  }
  return ordered;
}

// What a declaration-only reading is expected to cost: declarations are
// typically about a tenth of a file. Small files are read whole instead.
function outlineEstimate(file: GitHubTreeFile): number {
  const whole = estimatePromptCost(file.path, file.size);
  return Math.min(whole, SOURCE_LIMITS.outlineOnlyChars, Math.max(250, Math.round(whole * 0.12)));
}

export function selectSourceFiles(tree: GitHubTreeFile[], context: SelectionContext): SourceSelection {
  const limits = SOURCE_LIMITS;
  // Sorted by path so the result never depends on the order GitHub lists files in.
  const decisions: FileDecision[] = [...tree]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((file) => ({ ...file, ...classifyFile(file), selected: false, reason: "" }));
  assignUiRouteFolders(decisions);

  // The map is part of the source budget; its share is kept back here.
  const budget = limits.totalChars - limits.mapReserveChars;
  const files: SelectedSourceFile[] = [];
  const reserve: SelectedSourceFile[] = [];
  const takenShas = new Set<string>();
  let used = 0;
  const take = (
    decision: FileDecision,
    area: SelectedSourceFile["area"],
    mode: ReadMode,
    maxChars: number,
    plannedChars: number,
    reason: string,
  ) => {
    used += plannedChars;
    takenShas.add(decision.sha);
    decision.selected = true;
    decision.reason = reason;
    const { path, sha, size, category, role } = decision;
    files.push({ path, sha, size, category, role, area, mode, reason, maxChars, plannedChars });
  };
  // Exact or near-identical copies of a selected file are skipped.
  const skipCopy = (decision: FileDecision): boolean => {
    if (takenShas.has(decision.sha)) {
      decision.reason = "not selected: identical content already selected";
      return true;
    }
    const copyOf = files.find((f) => isNearDuplicate(f, decision));
    if (copyOf) {
      decision.reason = `not selected: near-identical copy of ${copyOf.path}`;
      return true;
    }
    return false;
  };

  // 1. Manifests, shallowest first: the root one describes the whole project.
  const manifests = decisions
    .filter((d) => d.role === "manifest")
    .sort((a, b) => depth(a.path) - depth(b.path) || (a.path < b.path ? -1 : 1));
  for (const manifest of manifests) {
    if (files.length >= limits.maxManifests) {
      manifest.reason = `not selected: limit of ${limits.maxManifests} manifests reached`;
    } else if (!skipCopy(manifest)) {
      const planned = Math.min(estimatePromptCost(manifest.path, manifest.size), limits.perManifestChars);
      take(manifest, "manifest", "deep", limits.perManifestChars, planned, "selected: project manifest (shallowest first)");
    }
  }

  // 2. Core source. Tiny files are skipped; too-large ones were already classified as generated.
  const core = decisions.filter((d) => d.category === "core");
  for (const d of core) if (d.size < limits.minFileBytes) d.reason = `not selected: under ${limits.minFileBytes} bytes (stub or re-export)`;
  const candidates = scoreCandidates(core.filter((d) => d.size >= limits.minFileBytes), context);
  const describe = (c: Candidate, how: string) => `selected: ${AREA_LABEL[c.file.area!]}, ${how}; ${c.why.join(", ")} (score ${c.score})`;

  // 2a. Small repository: every relevant file fits, so all of them are read in depth.
  const fullCost = candidates.reduce((sum, c) => sum + Math.min(estimatePromptCost(c.file.path, c.file.size), limits.perFileChars), 0);
  if (candidates.length > 0 && files.length + candidates.length <= limits.maxFiles && used + fullCost <= budget) {
    for (const c of diversifiedOrder(candidates)) {
      if (skipCopy(c.file)) continue;
      const planned = Math.min(estimatePromptCost(c.file.path, c.file.size), limits.perFileChars);
      take(c.file, c.file.area!, "deep", limits.perFileChars, planned, describe(c, "small repository: every relevant file"));
    }
  } else if (candidates.length > 0) {
    // 2b. Breadth first: each area gets its own budget, so no area can take
    // everything. Per area, the best file is read in depth and further files
    // as declarations only. Unused budget is shared afterwards.
    const queues = new Map<SourceArea, Candidate[]>();
    for (const area of SOURCE_AREAS) {
      const inArea = candidates.filter((c) => c.file.area === area);
      if (inArea.length > 0) queues.set(area, diversifiedOrder(inArea));
    }
    let spare = budget - used - [...queues.keys()].reduce((sum, area) => sum + limits.areaChars[area], 0);
    // File slots are shared too, so many small files in one area cannot use them all up.
    const slotsPerArea = Math.max(1, Math.floor((limits.maxFiles - files.length) / queues.size));

    for (const [area, queue] of queues) {
      let left = limits.areaChars[area];
      let deepTaken = false;
      const areaStart = files.length;
      while (queue.length > 0 && files.length < limits.maxFiles && files.length - areaStart < slotsPerArea) {
        const c = queue[0];
        if (skipCopy(c.file)) {
          queue.shift();
          continue;
        }
        if (!deepTaken) {
          // The depth reading goes to the best file with real content, not a tiny one.
          const index = Math.max(0, queue.findIndex((q) => q.file.size >= limits.minDeepBytes && !skipCopy(q.file)));
          const [deep] = queue.splice(index, 1);
          const cap = Math.min(limits.perFileChars, Math.floor(limits.areaChars[area] * limits.deepShare));
          const planned = Math.min(estimatePromptCost(deep.file.path, deep.file.size), cap);
          take(deep.file, area, "deep", cap, planned, describe(deep, "read in depth"));
          left -= planned;
          deepTaken = true;
          continue;
        } else {
          const planned = outlineEstimate(c.file);
          if (planned > left) break;
          take(c.file, area, "outline", limits.outlineOnlyChars, planned, describe(c, "declarations only"));
          left -= planned;
        }
        queue.shift();
      }
      spare += left;
    }

    // Leftover budget: more declaration-only files, one area at a time in turn.
    let added = true;
    while (added && files.length < limits.maxFiles) {
      added = false;
      for (const [area, queue] of queues) {
        while (queue.length > 0 && skipCopy(queue[0].file)) queue.shift();
        const c = queue[0];
        if (!c || files.length >= limits.maxFiles) continue;
        const planned = outlineEstimate(c.file);
        if (planned > spare) continue;
        take(c.file, area, "outline", limits.outlineOnlyChars, planned, describe(c, "declarations only (leftover budget)"));
        spare -= planned;
        queue.shift();
        added = true;
      }
    }
    // Reserve for the second pass (after fetching, with the measured remaining budget):
    // useful candidates only, the least-covered area first.
    const selectedIn = new Map<SourceArea, number>();
    for (const f of files) if (f.area !== "manifest" && f.area !== "fallback") selectedIn.set(f.area, (selectedIn.get(f.area) ?? 0) + 1);
    const totalIn = new Map<SourceArea, number>();
    for (const c of candidates) totalIn.set(c.file.area!, (totalIn.get(c.file.area!) ?? 0) + 1);
    const usefulQueues = new Map<SourceArea, Candidate[]>();
    for (const [area, queue] of queues) {
      const useful = queue.filter((c) => !takenShas.has(c.file.sha) && c.score >= RESERVE_MIN_SCORE && c.file.size >= RESERVE_MIN_BYTES && !files.some((f) => isNearDuplicate(f, c.file)));
      if (useful.length > 0) usefulQueues.set(area, useful);
    }
    while (reserve.length < RESERVE_SIZE && usefulQueues.size > 0) {
      let pick: SourceArea | null = null;
      for (const area of usefulQueues.keys()) {
        const ratio = (selectedIn.get(area) ?? 0) / (totalIn.get(area) ?? 1);
        const best = pick === null ? Infinity : (selectedIn.get(pick) ?? 0) / (totalIn.get(pick) ?? 1);
        if (ratio < best) pick = area;
      }
      const queue = usefulQueues.get(pick!)!;
      const c = queue.shift()!;
      if (queue.length === 0) usefulQueues.delete(pick!);
      selectedIn.set(pick!, (selectedIn.get(pick!) ?? 0) + 1);
      reserve.push({ path: c.file.path, sha: c.file.sha, size: c.file.size, category: c.file.category, role: c.file.role, area: pick!, mode: "outline", reason: `selected: ${AREA_LABEL[pick!]}, declarations only (second pass: least-covered area); ${c.why.join(", ")} (score ${c.score})`, maxChars: limits.outlineOnlyChars, plannedChars: outlineEstimate(c.file) });
    }
    const limitReason = files.length >= limits.maxFiles ? `the ${limits.maxFiles}-file limit was reached` : "its area's budget was used";
    for (const queue of queues.values()) {
      for (const c of queue) if (!c.file.reason) c.file.reason = `not selected: ranked below the selected files when ${limitReason} (score ${c.score})`;
    }
  }

  // 3. Fallback: with no usable core source, tests show how the code behaves.
  if (candidates.length === 0) {
    const fallback = decisions
      .filter((d) => (d.category === "test" || d.category === "docs") && CODE_EXTENSIONS.test(d.path) && d.size >= limits.minFileBytes)
      .sort((a, b) => (a.category === b.category ? depth(a.path) - depth(b.path) : a.category === "test" ? -1 : 1));
    for (const d of fallback) {
      if (files.length >= limits.maxFiles || budget - used < limits.minUsefulChars) break;
      if (takenShas.has(d.sha)) continue;
      const planned = Math.min(estimatePromptCost(d.path, d.size), limits.perFileChars, budget - used);
      take(d, "fallback", "deep", planned, planned, `selected: no core source found; ${d.category} file used instead`);
    }
  }

  // Every other file gets a reason from its category.
  for (const d of decisions) {
    if (d.reason) continue;
    if (d.category === "config") d.reason = `excluded: ${d.classification}; only manifests are sent`;
    else if (d.category === "test" || d.category === "docs" || d.category === "other") d.reason = `not selected: ${d.category} ranks below core source`;
    else d.reason = `excluded: ${d.classification}`;
  }

  const excluded = emptyTotals();
  for (const d of decisions) {
    if (d.selected) continue;
    excluded[d.category].files += 1;
    excluded[d.category].bytes += d.size;
  }
  return { files, plannedChars: used, excluded, decisions, reserve };
}
