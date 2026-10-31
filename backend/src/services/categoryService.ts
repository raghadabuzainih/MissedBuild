import { z } from "zod";
import rawCategories from "../data/categories.json";

// categories.json is the single source of truth; it is validated once at
// startup so a bad edit fails loudly instead of misclassifying repositories.
export const FALLBACK_CATEGORY_ID = "other";

const categoriesSchema = z
  .array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      name: z.string().min(1),
      // An icon name for the frontend; unknown names fall back to a generic icon.
      icon: z.string().regex(/^[a-z0-9-]+$/),
    }),
  )
  .refine((list) => new Set(list.map((c) => c.id)).size === list.length, {
    message: "Category IDs must be unique.",
  })
  .refine((list) => list.some((c) => c.id === FALLBACK_CATEGORY_ID), {
    message: `Categories must include "${FALLBACK_CATEGORY_ID}".`,
  });

export type Category = z.infer<typeof categoriesSchema>[number];

export const categories: readonly Category[] = categoriesSchema.parse(rawCategories);

const categoriesById = new Map(categories.map((c) => [c.id, c]));

export const isCategoryId = (id: string): boolean => categoriesById.has(id);

export const getCategory = (id: string): Category | undefined => categoriesById.get(id);
