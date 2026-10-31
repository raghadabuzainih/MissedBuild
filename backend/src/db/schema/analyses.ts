import {
  jsonb,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { unique } from "drizzle-orm/pg-core";
import { repositories } from "./repositories";
import { tz } from "../../utils/constants";

export const repositoryAnalyses = pgTable(
  "repository_analyses",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),

    evidenceFingerprint: text("evidence_fingerprint").notNull(),
    promptVersion: text("prompt_version").notNull(),
    model: text("model").notNull(),
    // Validated with zod before insert and after read (Step 7).
    result: jsonb("result").notNull(),

    createdAt: tz("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("repository_analyses_repo_fp_prompt_uq").on(
      table.repositoryId,
      table.evidenceFingerprint,
      table.promptVersion,
    ),
  ],
);
