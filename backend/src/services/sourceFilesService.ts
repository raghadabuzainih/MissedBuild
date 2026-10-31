import type { SourceFileEvidence, SourceFilesSummary } from "../types/analysis.js";
import type { GitHubFileContent } from "../types/github.js";
import { buildRepositoryMap, mapPromptCost } from "../utils/repositoryMap.js";
import {
  redactSecrets,
  scanRepositoryMap,
  scanSourceFile,
  type RepositoryMapEvidence,
  type Scanned,
} from "../utils/secretScan.js";
import { SOURCE_LIMITS, selectSourceFiles, type SelectedSourceFile } from "../utils/sourceSelection.js";
import { getFileContent, getTree } from "./githubService.js";

// Selected source files and a repository map as analysis evidence.
// Repository content is data only: it is read, scanned and cut, never
// executed, installed or followed.

// At most this many files are held in memory at once (each ≤ 1 MB).
const FETCH_BATCH_SIZE = 5;
// A declaration-only reading this small is still worth sending.
const MIN_OUTLINE_CHARS = 250;
// Second pass: at most this many extra files, only while this much budget is left.
const MAX_SECOND_PASS_FILES = 6;
const MIN_SECOND_PASS_CHARS = 1_000;
const SECOND_PASS_BATCH_SIZE = 3;

export type SourceFileRecord = SourceFilesSummary["files"][number];
export type UnusedSourceFile = SourceFilesSummary["unused"][number];

export type SourceFiles = {
  // Stored with the analysis result: paths, counts and reasons, no content.
  summary: SourceFilesSummary;
  // Scanned excerpts, in reading order: the only form in which code reaches the AI.
  files: Scanned<SourceFileEvidence>[];
  // Scanned repository map; null when it had to be withheld.
  map: Scanned<RepositoryMapEvidence> | null;
};

export type SourceFilesInput = {
  owner: string;
  name: string;
  language: string | null;
  // Already-scanned README text; used only to rank files it mentions.
  readme: string | null;
};

// Null when the repository has no files (gone or empty). GitHub errors are
// thrown as AppError, like the other GitHub calls.
export async function collectSourceFiles(repo: SourceFilesInput): Promise<SourceFiles | null> {
  const tree = await getTree(repo.owner, repo.name);
  if (!tree) return null;

  const selection = selectSourceFiles(tree.files, { repoName: repo.name, language: repo.language, readme: repo.readme });
  const fetchAll = (files: SelectedSourceFile[]) =>
    Promise.all(files.map((file) => getFileContent(repo.owner, repo.name, tree.commitSha, file.path)));

  // 1. Manifests first: their dependency lists go into the map.
  const manifests = selection.files.filter((file) => file.area === "manifest");
  const others = selection.files.filter((file) => file.area !== "manifest");
  const manifestContents = await fetchAll(manifests);

  // 2. The map, built from the file list and the (redacted) manifests. Its
  // measured cost comes out of the source budget.
  const manifestTexts = manifestContents.flatMap((fetched, index) => {
    if (fetched.status !== "ok") return [];
    const scan = redactSecrets(fetched.content);
    return scan.status === "dropped" ? [] : [{ path: manifests[index].path, content: scan.text }];
  });
  const builtMap = buildRepositoryMap(selection.decisions, manifestTexts, { treeTruncated: tree.truncated });
  const treeUrl = `https://github.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/tree/${tree.commitSha}`;
  const map = scanRepositoryMap(builtMap.text, treeUrl);
  const mapChars = map ? mapPromptCost(map.text) : 0;
  const budget = SOURCE_LIMITS.totalChars - mapChars;

  // 3. The files, in plan order; the budget is spent on measured costs.
  const records: SourceFileRecord[] = [];
  const files: Scanned<SourceFileEvidence>[] = [];
  const unused: UnusedSourceFile[] = [];
  let used = 0;

  const use = (file: SelectedSourceFile, fetched: GitHubFileContent) => {
    if (fetched.status !== "ok") {
      unused.push({ path: file.path, reason: fetched.status });
      return;
    }
    const allowed = Math.min(file.maxChars, budget - used);
    const scan = scanSourceFile(file.path, fetched.htmlUrl, fetched.content, allowed, {
      // Manifests are config, not code: their start only.
      outline: file.area !== "manifest",
      outlineOnly: file.mode === "outline",
    });
    if (scan.status === "dropped") {
      unused.push({
        path: file.path,
        reason: scan.reason === "private_key" ? "private_key" : "too_many_secrets",
        redactions: scan.redactions,
        redactionRules: scan.rules,
      });
      return;
    }
    // With little budget left, only a whole small file or a declaration list is worth sending.
    const minimum = file.mode === "outline" ? MIN_OUTLINE_CHARS : SOURCE_LIMITS.minUsefulChars;
    if (scan.status === "no_room" || (scan.excerpt.mode !== "full" && allowed < minimum)) {
      unused.push({ path: file.path, reason: "no_budget" });
      return;
    }
    used += scan.excerpt.promptChars;
    files.push(scan.file);
    records.push({
      path: file.path,
      category: file.category,
      role: file.role,
      area: file.area,
      reason: file.reason,
      promptChars: scan.excerpt.promptChars,
      repoChars: scan.excerpt.repoChars,
      truncated: scan.excerpt.truncated,
      excerpt: scan.excerpt.mode,
      redactions: scan.redactions,
      redactionRules: scan.rules,
    });
  };

  manifests.forEach((file, index) => use(file, manifestContents[index]));
  for (let i = 0; i < others.length; i += FETCH_BATCH_SIZE) {
    const batch = others.slice(i, i + FETCH_BATCH_SIZE);
    const contents = await fetchAll(batch);
    batch.forEach((file, index) => use(file, contents[index]));
  }

  // 4. Second pass: budget left after the measured first pass goes to the
  // reserve (useful files from the least-covered areas), declarations only.
  // Files are fetched only while there is room, so no request is wasted on
  // a file that could not be used.
  let extra = 0;
  for (let i = 0; i < selection.reserve.length; ) {
    const room = budget - used;
    if (extra >= MAX_SECOND_PASS_FILES || room < MIN_SECOND_PASS_CHARS) break;
    const take = Math.min(SECOND_PASS_BATCH_SIZE, MAX_SECOND_PASS_FILES - extra, Math.ceil(room / SOURCE_LIMITS.outlineOnlyChars));
    const batch = selection.reserve.slice(i, i + take);
    i += batch.length;
    const contents = await fetchAll(batch);
    batch.forEach((file, index) => {
      if (extra >= MAX_SECOND_PASS_FILES || budget - used < MIN_SECOND_PASS_CHARS) return;
      const before = records.length;
      use(file, contents[index]);
      if (records.length > before) extra += 1;
    });
  }

  return {
    summary: {
      commitSha: tree.commitSha,
      treeTruncated: tree.truncated,
      files: records,
      totalPromptChars: used,
      totalRepoChars: records.reduce((sum, file) => sum + file.repoChars, 0),
      excluded: selection.excluded,
      unused,
      map: map ? { promptChars: mapChars, lines: map.text.split("\n").length } : null,
    },
    files,
    map,
  };
}
