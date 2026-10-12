"use client";

import { clearAnalyticsUserId } from "@/lib/analytics/user-id";
import { authSessionRevision } from "./auth-session-events";

type FetchBackend = typeof fetch;
type PauseBackend = (delayMs: number) => Promise<void>;
type ClearAnalyticsUserId = () => void;

const REFRESH_CONFLICT_RETRY_DELAYS_MS = [100, 200, 400] as const;

export type AuthenticatedClient = Readonly<{
  fetch: FetchBackend;
  fetchOnce: FetchBackend;
  ensureAccessToken: () => Promise<boolean>;
}>;

/**
 * Retries one Resource Server request after rotating the path-scoped refresh
 * token through Main/Auth. The browser is the only component that can send the
 * refresh cookie because it is scoped to /api/v1/auth.
 */
export function createAuthenticatedClient(
  requestBackend: FetchBackend = fetch,
  pauseBackend: PauseBackend = pause,
  clearUserId: ClearAnalyticsUserId = clearAnalyticsUserId,
): AuthenticatedClient {
  let refreshInFlight: Promise<boolean> | null = null;

  function rotateAccessToken(requestUrl: string): Promise<boolean> {
    if (!refreshInFlight) {
      refreshInFlight = refreshAccessToken(
        requestUrl,
        requestBackend,
        pauseBackend,
        clearUserId,
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
    return rotateAccessToken(requestUrl);
  }

  const authenticatedRequest: FetchBackend = async (input, init) => {
    const revision = authSessionRevision();
    const firstRequest = createRequest(input, init);
    const retryRequest = firstRequest.clone();
    const firstResponse = await requestBackend(firstRequest);
    if (firstResponse.status !== 401 || isAuthRoute(firstRequest.url)) return firstResponse;
    if (firstRequest.signal.aborted || revision !== authSessionRevision()) return firstResponse;

    if (!(await rotateAccessToken(firstRequest.url))) return firstResponse;
    if (firstRequest.signal.aborted || revision !== authSessionRevision()) return firstResponse;

    await firstResponse.body?.cancel().catch(() => undefined);
    if (firstRequest.signal.aborted || revision !== authSessionRevision()) return firstResponse;
    return requestBackend(retryRequest);
  };

  /**
   * Credential-checking Main/Auth mutations answer a wrong code or password with 401 too.
   * Replaying those after a refresh would submit the same attempt twice, so the access token
   * is refreshed before the request and the request itself is sent exactly once.
   */
  const authenticatedRequestOnce: FetchBackend = async (input, init) => {
    await ensureAccessToken();
    return requestBackend(createRequest(input, init));
  };

  return { ensureAccessToken, fetch: authenticatedRequest, fetchOnce: authenticatedRequestOnce };
}

export function createAuthenticatedFetch(
  requestBackend: FetchBackend = fetch,
  pauseBackend: PauseBackend = pause,
  clearUserId: ClearAnalyticsUserId = clearAnalyticsUserId,
): FetchBackend {
  return createAuthenticatedClient(requestBackend, pauseBackend, clearUserId).fetch;
}

const authenticatedClient = createAuthenticatedClient();

export const authenticatedFetch = authenticatedClient.fetch;
export const authenticatedFetchOnce = authenticatedClient.fetchOnce;
export const ensureAccessToken = authenticatedClient.ensureAccessToken;

function createRequest(input: RequestInfo | URL, init?: RequestInit): Request {
  if (input instanceof Request) {
    return new Request(input, { ...init, credentials: "same-origin" });
  }
  const base = typeof location === "undefined" ? "http://localhost" : location.origin;
  return new Request(new URL(String(input), base), { ...init, credentials: "same-origin" });
}

function refreshRequest(requestUrl: string): Request {
  return new Request(new URL("/api/v1/auth/refresh", requestUrl), {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

async function refreshAccessToken(
  requestUrl: string,
  requestBackend: FetchBackend,
  pauseBackend: PauseBackend,
  clearUserId: ClearAnalyticsUserId,
): Promise<boolean> {
  let response: Response;
  try {
    response = await requestBackend(refreshRequest(requestUrl));
  } catch {
    return false;
  }

  if (response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return true;
  }
  if (response.status !== 409) {
    if (response.status === 401 || response.status === 403) clearUserId();
    await response.body?.cancel().catch(() => undefined);
    return false;
  }
  await response.body?.cancel().catch(() => undefined);

  for (const delayMs of REFRESH_CONFLICT_RETRY_DELAYS_MS) {
    await pauseBackend(delayMs);
    let currentUserResponse: Response;
    try {
      currentUserResponse = await requestBackend(currentUserRequest(requestUrl));
    } catch {
      return false;
    }
    if (currentUserResponse.ok) {
      await currentUserResponse.body?.cancel().catch(() => undefined);
      return true;
    }
    const accessTokenPending = currentUserResponse.status === 401;
    await currentUserResponse.body?.cancel().catch(() => undefined);
    if (!accessTokenPending) return false;
  }
  return false;
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
