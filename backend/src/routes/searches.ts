import { Router } from "express";
import { z } from "zod";
import { createSearch, getSearch } from "../services/searchService.js";

// Invalid input is rejected here with a 400, before any GitHub or AI call.
const createSearchSchema = z.object({
  query: z
    .string({ error: "Enter a search query." })
    .trim()
    .min(2, "The search query must be at least 2 characters.")
    .max(200, "The search query must be at most 200 characters.")
    .regex(/[\p{L}\p{N}]/u, "The search query must contain letters or numbers."),
});

const searchParamsSchema = z.object({
  id: z.uuid({ error: "Invalid search ID." }),
});

export const searchesRouter = Router();

searchesRouter.post("/", async (req, res) => {
  const { query } = createSearchSchema.parse(req.body ?? {});
  const search = await createSearch(query);
  res.status(202).location(`/api/searches/${search.id}`).json(search);
});

searchesRouter.get("/:id", async (req, res) => {
  const { id } = searchParamsSchema.parse(req.params);
  res.json(await getSearch(id));
});
