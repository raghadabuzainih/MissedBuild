import { Router } from "express";
import { categories } from "../services/categoryService.js";
import { getCategorySummary } from "../services/repositoryService.js";

export const categoriesRouter = Router();

categoriesRouter.get("/", (_req, res) => {
  res.json({ categories });
});

// Only categories with saved repositories, with their counts.
categoriesRouter.get("/summary", async (_req, res) => {
  res.json({ categories: await getCategorySummary() });
});
