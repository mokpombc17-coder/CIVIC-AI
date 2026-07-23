import "server-only";
import { serverEnv } from "@/lib/server/env";

/**
 * Server-only Spring Boot client.
 *
 * Connect your Next.js session here and add the upstream access token.
 * Do not import this module from Client Components.
 */
export async function operationsFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = new URL(path, ensureTrailingSlash(serverEnv.OPERATIONS_API_URL));
  const headers = new Headers(init.headers);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  return fetch(url, {
    ...init,
    headers,
    cache: init.cache ?? "no-store",
  });
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
