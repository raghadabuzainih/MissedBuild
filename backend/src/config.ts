import "dotenv/config";
import type { Config } from "./types/config.js";

const serverPort = process.env.PORT as string;
const dbURL = process.env.DATABASE_URL as string;
const metaApiKey = process.env.META_API_KEY as string;
const githubToken = process.env.GITHUB_TOKEN as string;

export const config: Config = {
  server: {
    port: Number(serverPort),
  },
  db: {
    url: dbURL
  },
  meta: {
    apiKey: metaApiKey
  },
  github: {
    token: githubToken
  }
};