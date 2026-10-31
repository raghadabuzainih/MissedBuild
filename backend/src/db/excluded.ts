import { sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

// In an upsert's ON CONFLICT DO UPDATE: the value the insert tried to write.
export const excluded = (column: PgColumn) => sql.raw(`excluded."${column.name}"`);
