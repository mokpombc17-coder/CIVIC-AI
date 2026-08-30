"use client";

import { notifyAccessTokenRefreshed } from "./authentication-session-events";

type FetchBackend = typeof fetch;
type PauseBackend = (delayMs: number) => Promise<void>;
type AccessTokenRefreshedCallback = () => void;

const REFRESH_CONFLICT_RETRY_DELAYS_MS = [100, 200, 400] as const;

export type AuthenticatedClient = Readonly<{
  fetch: FetchBackend;
  ensureAccessToken: () => Promise<boolean>;
}>;

export function createAuthenticatedClient(
  requestBackend: FetchBackend = fetch,
  pauseBackend: PauseBackend = pause,
  onAccessTokenRefreshed: AccessTokenRefreshedCallback = () => {},
): AuthenticatedClient {
  let refreshInFlight: Promise<boolean> | null = null;

  function rotateAccessToken(requestUrl: string): Promise<boolean> {
    if (!refreshInFlight) {
      refreshInFlight = refreshAccessToken(requestUrl, requestBackend, pauseBackend)
        .then((refreshed) => {
          if (refreshed) {
            onAccessTokenRefreshed();
          }

          return refreshed;
        })
        .finally(() => {
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
      await cancelResponseBody(response);
      return true;
    }

    if (response.status !== 401) {
      await cancelResponseBody(response);
      return false;
    }

    const requestUrl = response.url || createRequest("/api/v1/auth/me").url;
    await cancelResponseBody(response);
    return rotateAccessToken(requestUrl);
  }

  const authenticatedRequest: FetchBackend = async (input, init) => {
    const firstRequest = createRequest(input, init);
    const retryRequest = firstRequest.clone();
    const firstResponse = await requestBackend(firstRequest);

    if (firstResponse.status !== 401 || isAuthRoute(firstRequest.url)) {
      return firstResponse;
    }

    if (!(await rotateAccessToken(firstRequest.url))) {
      return firstResponse;
    }

    await cancelResponseBody(firstResponse);
    return requestBackend(retryRequest);
  };

  return { ensureAccessToken, fetch: authenticatedRequest };
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
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

async function refreshAccessToken(
  requestUrl: string,
  requestBackend: FetchBackend,
  pauseBackend: PauseBackend,
): Promise<boolean> {
  let response: Response;

  try {
    response = await requestBackend(refreshRequest(requestUrl));
  } catch {
    return false;
  }

  if (response.ok) {
    await cancelResponseBody(response);
    return true;
  }

  if (response.status !== 409) {
    await cancelResponseBody(response);
    return false;
  }

  await cancelResponseBody(response);

  for (const delayMs of REFRESH_CONFLICT_RETRY_DELAYS_MS) {
    await pauseBackend(delayMs);

    let currentUserResponse: Response;

    try {
      currentUserResponse = await requestBackend(currentUserRequest(requestUrl));
    } catch {
      return false;
    }

    if (currentUserResponse.ok) {
      await cancelResponseBody(currentUserResponse);
      return true;
    }

    const accessTokenPending = currentUserResponse.status === 401;
    await cancelResponseBody(currentUserResponse);

    if (!accessTokenPending) {
      return false;
    }
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

function cancelResponseBody(response: Response): Promise<void> {
  return response.body?.cancel().catch(() => undefined) ?? Promise.resolve();
}

function pause(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function isAuthRoute(requestUrl: string): boolean {
  return new URL(requestUrl).pathname.startsWith("/api/v1/auth/");
}
