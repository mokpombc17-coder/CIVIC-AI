import "server-only";
import { z } from "zod";

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().url().optional(),
);

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalPositiveInteger = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim();
  return normalized === "" ? undefined : Number(normalized);
}, z.number().int().positive().optional());

const serverEnvSchema = z.object({
  MAIN_AUTH_INTERNAL_URL: optionalUrl,
  RAG_INTERNAL_URL: optionalUrl,
  CIVIC_BROWSER_ORIGIN: optionalUrl,
  IOS_APP_STORE_URL: optionalUrl,
  ANDROID_PLAY_STORE_URL: optionalUrl,
  IOS_MINIMUM_BUILD_VERSION: optionalPositiveInteger,
  ANDROID_MINIMUM_BUILD_VERSION: optionalPositiveInteger,
  APPLE_TEAM_ID: optionalString,
  IOS_BUNDLE_IDENTIFIER: optionalString,
  ANDROID_PACKAGE_NAME: optionalString,
  ANDROID_SHA256_CERT_FINGERPRINTS: optionalString,
  PUSH_TOKEN_UPSTREAM_URL: optionalUrl,
  MOBILE_APP_SCHEME: z
    .string()
    .regex(/^[a-z][a-z0-9+.-]*$/)
    .default("nextwebview"),
});

const parsedServerEnv = serverEnvSchema.parse({
  MAIN_AUTH_INTERNAL_URL: process.env.MAIN_AUTH_INTERNAL_URL,
  RAG_INTERNAL_URL: process.env.RAG_INTERNAL_URL,
  CIVIC_BROWSER_ORIGIN: process.env.CIVIC_BROWSER_ORIGIN,
  IOS_APP_STORE_URL: process.env.IOS_APP_STORE_URL,
  ANDROID_PLAY_STORE_URL: process.env.ANDROID_PLAY_STORE_URL,
  IOS_MINIMUM_BUILD_VERSION: process.env.IOS_MINIMUM_BUILD_VERSION,
  ANDROID_MINIMUM_BUILD_VERSION: process.env.ANDROID_MINIMUM_BUILD_VERSION,
  APPLE_TEAM_ID: process.env.APPLE_TEAM_ID,
  IOS_BUNDLE_IDENTIFIER: process.env.IOS_BUNDLE_IDENTIFIER,
  ANDROID_PACKAGE_NAME: process.env.ANDROID_PACKAGE_NAME,
  ANDROID_SHA256_CERT_FINGERPRINTS: process.env.ANDROID_SHA256_CERT_FINGERPRINTS,
  PUSH_TOKEN_UPSTREAM_URL: process.env.PUSH_TOKEN_UPSTREAM_URL,
  MOBILE_APP_SCHEME: process.env.MOBILE_APP_SCHEME,
});

export const serverEnv = parsedServerEnv;
