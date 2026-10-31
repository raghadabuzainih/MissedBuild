export type Config = {
  server: {
    port: number;
  };
  frontend: {
    origin: string;
  };
  db: {
    url: string;
  };
  meta: {
    model: string;
    apiKey: string;
    // Client defaults; a call can override them (see metaLimits).
    timeoutMs: number;
    maxRetries: number;
  };
  github: {
    // Optional: without a token GitHub allows far fewer requests per hour.
    token: string | undefined;
  },
};