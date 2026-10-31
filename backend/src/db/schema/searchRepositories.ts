import {
  integer,
  pgTable,
  uuid,
} from "drizzle-orm/pg-core";
import { primaryKey } from "drizzle-orm/pg-core";
import { searches } from "./searches";
import { repositories } from "./repositories";

export const searchRepositories = pgTable(
  "search_repositories",
  {
    searchId: uuid("search_id")
      .notNull()
      .references(() => searches.id, { onDelete: "cascade" }),

    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),

    rank: integer("rank").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.searchId, table.repositoryId],
    }),
  ],
);
