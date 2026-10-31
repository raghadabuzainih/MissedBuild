import { isAxiosError } from "axios";
import type { ApiError } from "./types";

// Turns any request failure into the backend's error shape, so the UI only
// ever deals with `{ code, message }`.
export function toApiError(error: unknown): ApiError {
  if (isAxiosError(error)) {
    const body = error.response?.data as { error?: ApiError } | undefined;
    if (body?.error?.code) return body.error;
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return { code: "REQUEST_TIMEOUT", message: "The server took too long to respond. Please try again." };
    }
    if (!error.response) {
      return { code: "NETWORK_ERROR", message: "Could not reach the server. Check your connection and try again." };
    }
  }
  return { code: "UNKNOWN_ERROR", message: "Something went wrong. Please try again." };
}
