import { Router } from "express";
import { z } from "zod";
import { getAnalysisProgress } from "../services/analysisProgress.js";
import { isCategoryId } from "../services/categoryService.js";
import { analyzeRepository, getLatestAnalysis } from "../services/repositoryAnalysisService.js";
import { ANALYSIS_FILTERS, getRepositoryDetail, listRepositories } from "../services/repositoryService.js";

const listQuerySchema = z.object({
  category: z
    .string()
    .refine(isCategoryId, "Unknown category.")
    .optional(),
  searchId: z.uuid({ error: "Invalid search ID." }).optional(),
  // Stored analysis status: all, analyzed or not_analyzed.
  analysis: z.enum(ANALYSIS_FILTERS, { error: "Unknown analysis filter." }).default("all"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

const repositoryParamsSchema = z.object({
  id: z.uuid({ error: "Invalid repository ID." }),
});

export const repositoriesRouter = Router();

repositoriesRouter.get("/", async (req, res) => {
  res.json(await listRepositories(listQuerySchema.parse(req.query)));
});

repositoriesRouter.get("/:id", async (req, res) => {
  const { id } = repositoryParamsSchema.parse(req.params);
  res.json(await getRepositoryDetail(id));
});

// Synchronous: collects evidence and, unless a cached result matches, calls
// the AI (up to ~3 min with the analysis limits).
repositoriesRouter.post("/:id/analysis", async (req, res) => {
  const { id } = repositoryParamsSchema.parse(req.params);
  res.json(await analyzeRepository(id));
});

// Progress of a running (or just finished) analysis of this repository, from
// memory: no database, GitHub or AI request. `{ progress: null }` when none.
repositoriesRouter.get("/:id/analysis/progress", (req, res) => {
  const { id } = repositoryParamsSchema.parse(req.params);
  res.json({ progress: getAnalysisProgress(id) });
});

repositoriesRouter.get("/:id/analysis", async (req, res) => {
  const { id } = repositoryParamsSchema.parse(req.params);
  res.json(await getLatestAnalysis(id));
});
