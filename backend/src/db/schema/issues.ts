import {
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { repositories } from "./repositories";
import { tz } from "../../utils/constants";

export const issueStateEnum = pgEnum("issue_state", [
  "open",
  "closed",
]);

export const repositoryIssues = pgTable(
  "repository_issues",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),

    number: integer("number").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    state: issueStateEnum("state").notNull(),
    htmlUrl: text("html_url").notNull(),
    githubCreatedAt: tz("github_created_at"),
    githubUpdatedAt: tz("github_updated_at"),
    fetchedAt: tz("fetched_at").notNull().defaultNow(),
  },
  (table) => [
    unique("repository_issues_repo_number_uq").on(
      table.repositoryId,
      table.number,
    ),
  ],
);
