
import postgres from "postgres";
import { config } from "../config.js";

const conn = postgres(config.db.url);

async function testConnection() {
  try {
    const result = await conn`SELECT 1 AS result`;
    console.log("Database connected successfully!");
    console.log(result);
  } catch (error) {
    console.error("Database connection failed:", error);
  } finally {
    await conn.end();
  }
}

testConnection();
