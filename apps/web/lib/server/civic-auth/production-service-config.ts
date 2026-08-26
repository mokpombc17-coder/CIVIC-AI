import "server-only";

import { z } from "zod";

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().url().optional(),
);

const productionServiceSchema = z.object({
  MAIN_AUTH_INTERNAL_URL: optionalUrl,
  RAG_INTERNAL_URL: optionalUrl,
  CHAT_INTERNAL_URL: optionalUrl,
  VOTE_INTERNAL_URL: optionalUrl,
  CIVIC_BROWSER_ORIGIN: optionalUrl,
});

export type CivicProductionServiceConfig = Readonly<{
  browserOrigin?: string;
  chatUrl?: string;
  mainAuthUrl?: string;
  ragUrl?: string;
  voteUrl?: string;
}>;

export function readCivicProductionServiceConfig(
  environment: NodeJS.ProcessEnv = process.env,
): CivicProductionServiceConfig {
  const parsed = productionServiceSchema.parse(environment);
  return {
    ...(parsed.CIVIC_BROWSER_ORIGIN ? { browserOrigin: parsed.CIVIC_BROWSER_ORIGIN } : {}),
    ...(parsed.CHAT_INTERNAL_URL ? { chatUrl: parsed.CHAT_INTERNAL_URL } : {}),
    ...(parsed.MAIN_AUTH_INTERNAL_URL ? { mainAuthUrl: parsed.MAIN_AUTH_INTERNAL_URL } : {}),
    ...(parsed.RAG_INTERNAL_URL ? { ragUrl: parsed.RAG_INTERNAL_URL } : {}),
    ...(parsed.VOTE_INTERNAL_URL ? { voteUrl: parsed.VOTE_INTERNAL_URL } : {}),
  };
}

export const civicProductionServiceConfig = readCivicProductionServiceConfig();
