import { defineConfig } from "drizzle-kit";
import { config } from "./src/config.ts";

export default defineConfig({
  schema: "src/db/schema/index.ts",
  out: "src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: config.db.url,
  },
});