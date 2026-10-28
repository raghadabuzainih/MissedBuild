
import OpenAI from "openai";
import { config } from "../config.js";

const apiKey = config.meta.apiKey

if (!apiKey) {
  throw new Error("META_API_KEY is not set");
}

const client = new OpenAI({
  baseURL: "https://api.meta.ai/v1",
  apiKey,
});

export async function generateWithMeta(
  prompt: string,
): Promise<string> {
  const response = await client.responses.create({
    model: "muse-spark-1.3",
    input: prompt,
  });

  return response.output_text;
}
