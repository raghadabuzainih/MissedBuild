import OpenAI, { APIConnectionTimeoutError, APIError } from "openai";
import { config } from "../config.js";
import {model} from "../utils/constants.js"

const apiKey = config.meta.apiKey

if (!apiKey) {
  throw new Error("META_API_KEY is not set");
}

// The SDK enforces the timeout itself (it aborts the request) and retries
// timeouts too, so the worst case is (maxRetries + 1) * timeout.
const client = new OpenAI({
  baseURL: "https://api.meta.ai/v1",
  apiKey,
  timeout: config.meta.timeoutMs,
  maxRetries: config.meta.maxRetries,
});

export type MetaRequestOptions = {
  timeoutMs?: number;
  maxRetries?: number;
};

export async function generateWithMeta(
  prompt: string,
  options: MetaRequestOptions = {},
): Promise<string> {
  const response = await client.responses.create(
    {
      model: model,
      input: prompt,
    },
    // Only set keys are passed: an explicit `undefined` would override the
    // client default and the SDK rejects it.
    {
      ...(options.timeoutMs !== undefined && { timeout: options.timeoutMs }),
      ...(options.maxRetries !== undefined && { maxRetries: options.maxRetries }),
    },
  );

  return response.output_text;
}

export type MetaResult = {
  text: string;
  // As reported by Meta; null when the response carries no usage.
  usage: OpenAI.Responses.ResponseUsage | null;
  requestId: string | null;
};

// Same client, endpoint, model, request body, timeout and retries as
// generateWithMeta; it also returns the reported usage and request ID.
export async function generateWithMetaDetailed(
  prompt: string,
  options: MetaRequestOptions = {},
): Promise<MetaResult> {
  const response = await client.responses.create(
    {
      model: model,
      input: prompt,
    },
    {
      ...(options.timeoutMs !== undefined && { timeout: options.timeoutMs }),
      ...(options.maxRetries !== undefined && { maxRetries: options.maxRetries }),
    },
  );

  return {
    text: response.output_text,
    usage: response.usage ?? null,
    requestId: response._request_id ?? null,
  };
}

export function isMetaTimeout(error: unknown): boolean {
  return error instanceof APIConnectionTimeoutError;
}

// A log-safe summary of a Meta failure: never the prompt, headers or API key.
export function describeMetaError(error: unknown): string {
  if (isMetaTimeout(error)) return "timed out";
  // SDK error classes keep `name` as "Error"; the class name is more useful,
  // and the SDK's message already starts with the HTTP status.
  if (error instanceof APIError) return `${error.constructor.name}: ${error.message.slice(0, 200)}`;
  return error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : "unknown error";
}
