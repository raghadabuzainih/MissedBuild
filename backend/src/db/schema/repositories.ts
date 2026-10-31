import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { tz } from "../../utils/constants";

export const classificationMethodEnum = pgEnum("classification_method", [
  "ai",
  "topic_match",
  "fallback",
]);

export const repositories = pgTable(
  "repositories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    githubId: bigint("github_id", { mode: "number" }).notNull().unique(),
    fullName: text("full_name").notNull(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    htmlUrl: text("html_url").notNull(),
    description: text("description"),
    language: text("language"),
    topics: text("topics").array().notNull().default([]),
    stars: integer("stars").notNull().default(0),
    forks: integer("forks").notNull().default(0),
    openIssues: integer("open_issues").notNull().default(0),
    githubPushedAt: tz("github_pushed_at"),
    githubUpdatedAt: tz("github_updated_at"),

    readmeContent: text("readme_content"),
    readmeUrl: text("readme_url"),
    readmeFetchedAt: tz("readme_fetched_at"),

    // ID from src/data/categories.json; validated in code, not in the DB.
    categoryId: text("category_id").notNull().default("other"),
    categoryConfidence: real("category_confidence"),
    categoryMethod: classificationMethodEnum("category_method"),
    categoryReason: text("category_reason"),
    classifiedAt: tz("classified_at"),

    etag: text("etag"),
    archived: boolean("archived").notNull().default(false),
    unavailableAt: tz("unavailable_at"),
    syncedAt: tz("synced_at").notNull().defaultNow(),

    createdAt: tz("created_at").notNull().defaultNow(),
    updatedAt: tz("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [index("repositories_category_idx").on(table.categoryId)],
);
