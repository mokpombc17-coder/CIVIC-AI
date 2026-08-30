"use client";

import { authEndpoint } from "./pwa-auth";

type FetchBackend = typeof fetch;
type PauseBackend = (delayMs: number) => Promise<void>;
type RefreshPathBackend = () => string;

const REFRESH_CONFLICT_RETRY_DELAYS_MS = [100, 200, 400] as const;

export type AccessTokenRefreshResult = "authenticated" | "unauthorized" | "unavailable";

export type AuthenticatedClient = Readonly<{
  fetch: FetchBackend;
  ensureAccessToken: () => Promise<boolean>;
  refreshAccessToken: () => Promise<AccessTokenRefreshResult>;
}>;

/**
 * Retries one Resource Server request after rotating the path-scoped refresh
 * token through Main/Auth. The browser is the only component that can send the
 * refresh cookie because it is scoped to /api/v1/auth.
 */
export function createAuthenticatedClient(
  requestBackend: FetchBackend = fetch,
  pauseBackend: PauseBackend = pause,
  refreshPathBackend: RefreshPathBackend = () => authEndpoint("refresh"),
): AuthenticatedClient {
  let refreshInFlight: Promise<AccessTokenRefreshResult> | null = null;

  function rotateAccessToken(requestUrl: string): Promise<AccessTokenRefreshResult> {
    if (!refreshInFlight) {
      refreshInFlight = performRefresh(
        requestUrl,
        requestBackend,
        pauseBackend,
        refreshPathBackend,
      ).finally(() => {
        refreshInFlight = null;
      });
    }
    return refreshInFlight;
  }

  async function ensureAccessToken(): Promise<boolean> {
    let response: Response;
    try {
      response = await requestBackend(
        createRequest("/api/v1/auth/me", { cache: "no-store", method: "GET" }),
      );
    } catch {
      return false;
    }
    if (response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return true;
    }
    if (response.status !== 401) {
      await response.body?.cancel().catch(() => undefined);
      return false;
    }
    const requestUrl = response.url || createRequest("/api/v1/auth/me").url;
    await response.body?.cancel().catch(() => undefined);
    return (await rotateAccessToken(requestUrl)) === "authenticated";
  }

  function refreshAccessToken(): Promise<AccessTokenRefreshResult> {
    return rotateAccessToken(createRequest("/api/v1/auth/me").url);
  }

  const authenticatedRequest: FetchBackend = async (input, init) => {
    const firstRequest = createRequest(input, init);
    const retryRequest = firstRequest.clone();
    const firstResponse = await requestBackend(firstRequest);
    if (firstResponse.status !== 401 || isAuthRoute(firstRequest.url)) return firstResponse;

    if ((await rotateAccessToken(firstRequest.url)) !== "authenticated") return firstResponse;

    await firstResponse.body?.cancel().catch(() => undefined);
    return requestBackend(retryRequest);
  };

  return { ensureAccessToken, fetch: authenticatedRequest, refreshAccessToken };
}

export function createAuthenticatedFetch(
  requestBackend: FetchBackend = fetch,
  pauseBackend: PauseBackend = pause,
  refreshPathBackend: RefreshPathBackend = () => authEndpoint("refresh"),
): FetchBackend {
  return createAuthenticatedClient(requestBackend, pauseBackend, refreshPathBackend).fetch;
}

const authenticatedClient = createAuthenticatedClient();

export const authenticatedFetch = authenticatedClient.fetch;
export const ensureAccessToken = authenticatedClient.ensureAccessToken;
export const refreshAccessToken = authenticatedClient.refreshAccessToken;

function createRequest(input: RequestInfo | URL, init?: RequestInit): Request {
  if (input instanceof Request) {
    return new Request(input, { ...init, credentials: "same-origin" });
  }
  const base = typeof location === "undefined" ? "http://localhost" : location.origin;
  return new Request(new URL(String(input), base), { ...init, credentials: "same-origin" });
}

function refreshRequest(requestUrl: string, refreshPath: string): Request {
  return new Request(new URL(refreshPath, requestUrl), {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

async function performRefresh(
  requestUrl: string,
  requestBackend: FetchBackend,
  pauseBackend: PauseBackend,
  refreshPathBackend: RefreshPathBackend,
): Promise<AccessTokenRefreshResult> {
  let response: Response;
  try {
    response = await requestBackend(refreshRequest(requestUrl, refreshPathBackend()));
  } catch {
    return "unavailable";
  }

  if (response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return "authenticated";
  }
  const unauthorized = response.status === 401;
  if (response.status !== 409) {
    await response.body?.cancel().catch(() => undefined);
    return unauthorized ? "unauthorized" : "unavailable";
  }
  await response.body?.cancel().catch(() => undefined);

  for (const delayMs of REFRESH_CONFLICT_RETRY_DELAYS_MS) {
    await pauseBackend(delayMs);
    let currentUserResponse: Response;
    try {
      currentUserResponse = await requestBackend(currentUserRequest(requestUrl));
    } catch {
      return "unavailable";
    }
    if (currentUserResponse.ok) {
      await currentUserResponse.body?.cancel().catch(() => undefined);
      return "authenticated";
    }
    const accessTokenPending = currentUserResponse.status === 401;
    await currentUserResponse.body?.cancel().catch(() => undefined);
    if (!accessTokenPending) return "unavailable";
  }
  return "unavailable";
}

function currentUserRequest(requestUrl: string): Request {
  return new Request(new URL("/api/v1/auth/me", requestUrl), {
    cache: "no-store",
    credentials: "same-origin",
    method: "GET",
  });
}

function pause(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function isAuthRoute(requestUrl: string): boolean {
  return new URL(requestUrl).pathname.startsWith("/api/v1/auth/");
}
