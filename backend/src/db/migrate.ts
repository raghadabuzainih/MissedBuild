import type { MigrationConfig } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { config } from "../config.js";
import { drizzle } from "drizzle-orm/postgres-js";

const migrationConfig: MigrationConfig = {
  migrationsFolder: "src/migrations",
};

export const runMigrations = async () => {
  const migrationClient = postgres(config.db.url, { max: 1 });
  await migrate(drizzle(migrationClient), migrationConfig);
};