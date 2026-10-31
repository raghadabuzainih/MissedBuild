import "dotenv/config";
import type { Config } from "./types/config.js";
import { model } from "./utils/constants.js";

const serverPort = process.env.PORT as string;
const dbURL = process.env.DATABASE_URL as string;
const metaApiKey = process.env.META_API_KEY as string;
const githubToken = process.env.GITHUB_TOKEN as string;

const DEFAULT_META_TIMEOUT_MS = 30_000;
const metaTimeoutMs = Number(process.env.META_TIMEOUT_MS ?? DEFAULT_META_TIMEOUT_MS);

export const config: Config = {
  server: {
    port: Number(serverPort),
  },
  frontend: {
    origin: "http://localhost:5173"
  },
  db: {
    url: dbURL
  },
  meta: {
    model: model,
    apiKey: metaApiKey,
    // An invalid META_TIMEOUT_MS falls back to the default instead of NaN.
    timeoutMs: Number.isInteger(metaTimeoutMs) && metaTimeoutMs > 0 ? metaTimeoutMs : DEFAULT_META_TIMEOUT_MS,
    maxRetries: 1
  },
  github: {
    token: githubToken
  }
};