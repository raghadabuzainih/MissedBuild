// An error that is safe to show to the client: an HTTP status, a stable
// machine-readable code the frontend can branch on, and a user-facing message.
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
