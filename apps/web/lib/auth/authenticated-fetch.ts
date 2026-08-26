"use client";

type FetchBackend = typeof fetch;

export type AuthenticatedClient = Readonly<{
  fetch: FetchBackend;
  ensureAccessToken: () => Promise<boolean>;
}>;

/**
 * Retries one Resource Server request after rotating the path-scoped refresh
 * token through Main/Auth. The browser is the only component that can send the
 * refresh cookie because it is scoped to /api/v1/auth.
 */
export function createAuthenticatedClient(
  requestBackend: FetchBackend = fetch,
): AuthenticatedClient {
  let refreshInFlight: Promise<boolean> | null = null;

  function rotateAccessToken(requestUrl: string): Promise<boolean> {
    if (!refreshInFlight) {
      refreshInFlight = requestBackend(refreshRequest(requestUrl))
        .then((response) => response.ok)
        .catch(() => false)
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
    const firstRequest = createRequest(input, init);
    const retryRequest = firstRequest.clone();
    const firstResponse = await requestBackend(firstRequest);
    if (firstResponse.status !== 401 || isAuthRoute(firstRequest.url)) return firstResponse;

    if (!(await rotateAccessToken(firstRequest.url))) return firstResponse;

    await firstResponse.body?.cancel().catch(() => undefined);
    return requestBackend(retryRequest);
  };

  return { ensureAccessToken, fetch: authenticatedRequest };
}

export function createAuthenticatedFetch(requestBackend: FetchBackend = fetch): FetchBackend {
  return createAuthenticatedClient(requestBackend).fetch;
}

const authenticatedClient = createAuthenticatedClient();

export const authenticatedFetch = authenticatedClient.fetch;
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

function isAuthRoute(requestUrl: string): boolean {
  return new URL(requestUrl).pathname.startsWith("/api/v1/auth/");
}
