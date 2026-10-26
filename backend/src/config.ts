import "dotenv/config";
import type { Config } from "./types/config.js";

const serverPort = process.env.PORT as string;

//db
const dbURL = process.env.DATABASE_URL as string;

export const config: Config = {
  server: {
    port: Number(serverPort),
  },
  db: {
    url: dbURL
  },
};