export type Config = {
  server: {
    port: number;
  };
  db: {
    url: string;
  },
  meta: {
    apiKey: string,
  },
  github: {
    token: string,
  },
};