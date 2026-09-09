"use client";

import { notifyAccessTokenRefreshed } from "./authentication-session-events";

type FetchBackend = typeof fetch;
type PauseBackend = (delayMs: number) => Promise<void>;
type AccessTokenRefreshedCallback = () => void;

const REFRESH_CONFLICT_RETRY_DELAYS_MS = [100, 200, 400] as const;

export type AuthenticatedClient = Readonly<{
  fetch: FetchBackend;
  ensureAccessToken: () => Promise<boolean>;
  recoverAccessToken: (requestUrl?: string) => Promise<AccessTokenRecoveryResult>;
}>;

export type AccessTokenRecoveryResult =
  "authenticated" | "authentication-required" | "temporarily-unavailable";

export function createAuthenticatedClient(
  requestBackend: FetchBackend = fetch,
  pauseBackend: PauseBackend = pause,
  onAccessTokenRefreshed: AccessTokenRefreshedCallback = () => {},
): AuthenticatedClient {
  const refreshInFlightByOrigin = new Map<string, Promise<AccessTokenRecoveryResult>>();

  function rotateAccessToken(requestUrl: string): Promise<AccessTokenRecoveryResult> {
    const requestOrigin = new URL(requestUrl).origin;
    const existingRefresh = refreshInFlightByOrigin.get(requestOrigin);

    if (existingRefresh) {
      return existingRefresh;
    }

    const refresh = refreshAccessToken(requestUrl, requestBackend, pauseBackend)
      .then((result) => {
        if (result === "authenticated") {
          onAccessTokenRefreshed();
        }

        return result;
      })
      .finally(() => {
        if (refreshInFlightByOrigin.get(requestOrigin) === refresh) {
          refreshInFlightByOrigin.delete(requestOrigin);
        }
      });
    refreshInFlightByOrigin.set(requestOrigin, refresh);

    return refresh;
  }

  async function recoverAccessToken(
    requestUrl = createRequest("/api/v1/auth/me").url,
  ): Promise<AccessTokenRecoveryResult> {
    let response: Response;

    try {
      response = await requestBackend(currentUserRequest(requestUrl));
    } catch {
      return "temporarily-unavailable";
    }

    if (response.ok) {
      await cancelResponseBody(response);
      return "authenticated";
    }

    if (response.status !== 401) {
      await cancelResponseBody(response);
      return "temporarily-unavailable";
    }

    const refreshRequestUrl = response.url || currentUserRequest(requestUrl).url;
    await cancelResponseBody(response);
    return rotateAccessToken(refreshRequestUrl);
  }

  async function ensureAccessToken(): Promise<boolean> {
    return (await recoverAccessToken()) === "authenticated";
  }

  const authenticatedRequest: FetchBackend = async (input, init) => {
    const firstRequest = createRequest(input, init);
    const retryRequest = firstRequest.clone();
    const firstResponse = await requestBackend(firstRequest);

    if (firstResponse.status !== 401 || isAuthRoute(firstRequest.url)) {
      return firstResponse;
    }

    if ((await rotateAccessToken(firstRequest.url)) !== "authenticated") {
      return firstResponse;
    }

    await cancelResponseBody(firstResponse);
    return requestBackend(retryRequest);
  };

  return { ensureAccessToken, fetch: authenticatedRequest, recoverAccessToken };
}

export function createAuthenticatedFetch(
  requestBackend: FetchBackend = fetch,
  pauseBackend: PauseBackend = pause,
): FetchBackend {
  return createAuthenticatedClient(requestBackend, pauseBackend).fetch;
}

const authenticatedClient = createAuthenticatedClient(fetch, pause, () => {
  if (typeof window !== "undefined") {
    notifyAccessTokenRefreshed(window);
  }
});

export const authenticatedFetch = authenticatedClient.fetch;
export const ensureAccessToken = authenticatedClient.ensureAccessToken;
export const recoverAccessToken = authenticatedClient.recoverAccessToken;

function createRequest(input: RequestInfo | URL, init?: RequestInit): Request {
  const credentials =
    init?.credentials ?? (input instanceof Request ? input.credentials : "same-origin");

  if (input instanceof Request) {
    return new Request(input, { ...init, credentials });
  }

  const base = typeof location === "undefined" ? "http://localhost" : location.origin;
  return new Request(new URL(String(input), base), { ...init, credentials });
}

function refreshRequest(requestUrl: string): Request {
  return new Request(new URL("/api/v1/auth/refresh", requestUrl), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

async function refreshAccessToken(
  requestUrl: string,
  requestBackend: FetchBackend,
  pauseBackend: PauseBackend,
): Promise<AccessTokenRecoveryResult> {
  let response: Response;

  try {
    response = await requestBackend(refreshRequest(requestUrl));
  } catch {
    return "temporarily-unavailable";
  }

  if (response.ok) {
    await cancelResponseBody(response);
    return "authenticated";
  }

  if (response.status !== 409) {
    const authenticationRequired = response.status === 401 || response.status === 403;
    await cancelResponseBody(response);
    return authenticationRequired ? "authentication-required" : "temporarily-unavailable";
  }

  await cancelResponseBody(response);

  for (const delayMs of REFRESH_CONFLICT_RETRY_DELAYS_MS) {
    await pauseBackend(delayMs);

    let currentUserResponse: Response;

    try {
      currentUserResponse = await requestBackend(currentUserRequest(requestUrl));
    } catch {
      return "temporarily-unavailable";
    }

    if (currentUserResponse.ok) {
      await cancelResponseBody(currentUserResponse);
      return "authenticated";
    }

    const accessTokenPending = currentUserResponse.status === 401;
    await cancelResponseBody(currentUserResponse);

    if (!accessTokenPending) {
      return "temporarily-unavailable";
    }
  }

  return "temporarily-unavailable";
}

function currentUserRequest(requestUrl: string): Request {
  return new Request(new URL("/api/v1/auth/me", requestUrl), {
    cache: "no-store",
    credentials: "include",
    method: "GET",
  });
}

function cancelResponseBody(response: Response): Promise<void> {
  return response.body?.cancel().catch(() => undefined) ?? Promise.resolve();
}

function pause(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function isAuthRoute(requestUrl: string): boolean {
  return new URL(requestUrl).pathname.startsWith("/api/v1/auth/");
}
