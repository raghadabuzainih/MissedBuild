import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/appError.js";

// Converts any error into `{ error: { code, message } }`.
// Internal details (stack traces, SQL, upstream responses) are logged on the
// server only and never sent to the client.
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: "The request contains invalid values.",
        details: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
    return;
  }

  // Errors raised by express.json() for malformed or oversized bodies.
  if (error?.type === "entity.parse.failed") {
    res.status(400).json({
      error: { code: "INVALID_JSON", message: "The request body is not valid JSON." },
    });
    return;
  }
  if (error?.type === "entity.too.large") {
    res.status(413).json({
      error: { code: "PAYLOAD_TOO_LARGE", message: "The request body is too large." },
    });
    return;
  }

  console.error("Unhandled error:", error);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
  });
};
