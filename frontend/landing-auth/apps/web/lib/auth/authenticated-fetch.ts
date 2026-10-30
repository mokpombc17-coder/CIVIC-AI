"use client";

import { clearAnalyticsUserId } from "@/lib/analytics/user-id";
import { authSessionRevision } from "./auth-session-events";

type FetchBackend = typeof fetch;
type PauseBackend = (delayMs: number) => Promise<void>;
type ClearAnalyticsUserId = () => void;

const REFRESH_CONFLICT_RETRY_DELAYS_MS = [100, 200, 400] as const;

/** `rejected`: Main/Auth refused the session. `unavailable`: it could not be confirmed now. */
export type RefreshOutcome = "refreshed" | "rejected" | "unavailable";

export type AuthenticatedClient = Readonly<{
  fetch: FetchBackend;
  fetchOnce: FetchBackend;
  ensureAccessToken: () => Promise<boolean>;
  refreshSession: () => Promise<RefreshOutcome>;
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
  let refreshInFlight: Promise<RefreshOutcome> | null = null;

  function refreshSession(
    requestUrl = createRequest("/api/v1/auth/refresh").url,
  ): Promise<RefreshOutcome> {
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

  async function rotateAccessToken(requestUrl: string): Promise<boolean> {
    return (await refreshSession(requestUrl)) === "refreshed";
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
   * is refreshed before the request and the request itself is sent exactly once. The request
   * is not sent when that preflight fails, the caller aborts, or another tab switches the
   * account meanwhile. Once sent it is no longer aborted: Main/Auth may already have applied
   * it, so the caller must see its response.
   */
  const authenticatedRequestOnce: FetchBackend = async (input, init) => {
    const revision = authSessionRevision();
    const request = createRequest(input, init);
    const { signal } = request;
    signal.throwIfAborted();
    const preflight = await requestBackend(currentUserRequest(request.url, signal));
    if (!preflight.ok) {
      if (preflight.status !== 401 || revision !== authSessionRevision()) return preflight;
      if (!(await untilAborted(rotateAccessToken(request.url), signal))) return preflight;
    }
    await preflight.body?.cancel().catch(() => undefined);
    signal.throwIfAborted();
    if (revision !== authSessionRevision()) return sessionChanged();
    return requestBackend(new Request(request, { signal: null }));
  };

  return {
    ensureAccessToken,
    fetch: authenticatedRequest,
    fetchOnce: authenticatedRequestOnce,
    refreshSession: () => refreshSession(),
  };
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
export const refreshSession = authenticatedClient.refreshSession;

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
): Promise<RefreshOutcome> {
  let response: Response;
  try {
    response = await requestBackend(refreshRequest(requestUrl));
  } catch {
    return "unavailable";
  }

  if (response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return "refreshed";
  }
  if (response.status !== 409) {
    const rejected = response.status === 401 || response.status === 403;
    if (rejected) clearUserId();
    await response.body?.cancel().catch(() => undefined);
    return rejected ? "rejected" : "unavailable";
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
      return "refreshed";
    }
    const accessTokenPending = currentUserResponse.status === 401;
    await currentUserResponse.body?.cancel().catch(() => undefined);
    if (!accessTokenPending) return "unavailable";
  }
  // Another tab won the rotation but its access token never became visible here.
  return "rejected";
}

function currentUserRequest(requestUrl: string, signal: AbortSignal | null = null): Request {
  return new Request(new URL("/api/v1/auth/me", requestUrl), {
    cache: "no-store",
    credentials: "same-origin",
    method: "GET",
    signal,
  });
}

/** The request was never sent because the signed-in account changed in another tab. */
function sessionChanged(): Response {
  return new Response(null, { status: 401 });
}

/** Stops waiting on abort without cancelling a refresh that other callers share. */
function untilAborted<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function pause(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function isAuthRoute(requestUrl: string): boolean {
  return new URL(requestUrl).pathname.startsWith("/api/v1/auth/");
}
