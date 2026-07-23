import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  OPERATIONS_API_URL: z.string().url().default("http://localhost:8080"),
});

export const serverEnv = serverEnvSchema.parse({
  OPERATIONS_API_URL: process.env.OPERATIONS_API_URL,
});
