import { describe, expect, it, vi } from "vitest";
import { createAuthenticatedClient, createAuthenticatedFetch } from "./authenticated-fetch";

describe("createAuthenticatedFetch", () => {
  it("rotates the refresh token and retries a resource request once", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ code: "UNAUTHORIZED" }, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ status: "ok" }));

    const response = await createAuthenticatedFetch(request)(
      "https://civic.example/api/v1/rag/queries/job-1",
    );

    expect(response.status).toBe(200);
    expect(request).toHaveBeenCalledTimes(3);
    expect(new URL((request.mock.calls[1]![0] as Request).url).pathname).toBe(
      "/api/v1/auth/refresh",
    );
    expect((request.mock.calls[2]![0] as Request).url).toBe(
      "https://civic.example/api/v1/rag/queries/job-1",
    );
  });

  it("returns the original 401 when refresh is unavailable", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ code: "UNAUTHORIZED" }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ code: "UNAUTHORIZED" }, { status: 401 }));

    const response = await createAuthenticatedFetch(request)(
      "https://civic.example/api/v1/rag/queries/job-1",
    );

    expect(response.status).toBe(401);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("never recursively refreshes an Auth request", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ code: "UNAUTHORIZED" }, { status: 401 }));

    await createAuthenticatedFetch(request)("https://civic.example/api/v1/auth/me");

    expect(request).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent refresh-token rotation", async () => {
    const firstAttempts = new Set<string>();
    let releaseRefresh: (() => void) | undefined;
    let refreshCalls = 0;
    const request = vi.fn<typeof fetch>(async (input) => {
      const pathname = new URL((input as Request).url).pathname;
      if (pathname === "/api/v1/auth/refresh") {
        refreshCalls += 1;
        return new Promise<Response>((resolve) => {
          releaseRefresh = () => resolve(new Response(null, { status: 204 }));
        });
      }
      if (!firstAttempts.has(pathname)) {
        firstAttempts.add(pathname);
        return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
      }
      return Response.json({ status: "ok" });
    });
    const authenticatedRequest = createAuthenticatedFetch(request);

    const first = authenticatedRequest("https://civic.example/api/v1/rag/folders");
    const second = authenticatedRequest("https://civic.example/api/v1/rag/jobs/summary");
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    releaseRefresh?.();

    await expect(Promise.all([first, second])).resolves.toMatchObject([
      { status: 200 },
      { status: 200 },
    ]);
    expect(refreshCalls).toBe(1);
  });

  it("waits for another tab's 409 rotation and retries only the resource request", async () => {
    let resourceCalls = 0;
    let currentUserCalls = 0;
    let refreshCalls = 0;
    const request = vi.fn<typeof fetch>(async (input) => {
      const pathname = new URL((input as Request).url).pathname;
      if (pathname === "/api/v1/auth/refresh") {
        refreshCalls += 1;
        return Response.json({ code: "REFRESH_CONFLICT" }, { status: 409 });
      }
      if (pathname === "/api/v1/auth/me") {
        currentUserCalls += 1;
        return currentUserCalls === 1
          ? Response.json({ code: "UNAUTHORIZED" }, { status: 401 })
          : Response.json({ subject: "user-1" });
      }
      resourceCalls += 1;
      return resourceCalls === 1
        ? Response.json({ code: "UNAUTHORIZED" }, { status: 401 })
        : Response.json({ status: "ok" });
    });
    const pause = vi.fn(async () => undefined);

    const response = await createAuthenticatedFetch(
      request,
      pause,
    )("https://civic.example/api/v1/rag/folders");

    expect(response.status).toBe(200);
    expect(refreshCalls).toBe(1);
    expect(resourceCalls).toBe(2);
    expect(pause.mock.calls).toEqual([[100], [200]]);
  });

  it("returns the original 401 when a 409 rotation never becomes visible", async () => {
    let resourceCalls = 0;
    let refreshCalls = 0;
    const request = vi.fn<typeof fetch>(async (input) => {
      const pathname = new URL((input as Request).url).pathname;
      if (pathname === "/api/v1/auth/refresh") {
        refreshCalls += 1;
        return Response.json({ code: "REFRESH_CONFLICT" }, { status: 409 });
      }
      if (pathname === "/api/v1/auth/me") {
        return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
      }
      resourceCalls += 1;
      return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
    });
    const pause = vi.fn(async () => undefined);

    const response = await createAuthenticatedFetch(
      request,
      pause,
    )("https://civic.example/api/v1/rag/folders");

    expect(response.status).toBe(401);
    expect(refreshCalls).toBe(1);
    expect(resourceCalls).toBe(1);
    expect(pause.mock.calls).toEqual([[100], [200], [400]]);
  });

  it("does not rotate a fresh access token during a resource preflight", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ subject: "user-1" }));

    await expect(createAuthenticatedClient(request).ensureAccessToken()).resolves.toBe(true);

    expect(request).toHaveBeenCalledTimes(1);
    expect(new URL((request.mock.calls[0]![0] as Request).url).pathname).toBe("/api/v1/auth/me");
  });

  it("rotates an expired access token during a resource preflight", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ code: "UNAUTHORIZED" }, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(createAuthenticatedClient(request).ensureAccessToken()).resolves.toBe(true);

    expect(request).toHaveBeenCalledTimes(2);
    expect(new URL((request.mock.calls[1]![0] as Request).url).pathname).toBe(
      "/api/v1/auth/refresh",
    );
  });

  it("rotates through the dedicated PWA endpoint when installed mode selects it", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const client = createAuthenticatedClient(
      request,
      async () => undefined,
      () => "/api/v1/auth/pwa/refresh",
    );

    await expect(client.refreshAccessToken()).resolves.toBe("authenticated");

    expect(request).toHaveBeenCalledTimes(1);
    expect(new URL((request.mock.calls[0]![0] as Request).url).pathname).toBe(
      "/api/v1/auth/pwa/refresh",
    );
  });

  it("distinguishes an expired PWA session from a temporarily unavailable refresh", async () => {
    const unauthorized = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ code: "UNAUTHORIZED" }, { status: 401 }));
    const unavailable = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));

    await expect(createAuthenticatedClient(unauthorized).refreshAccessToken()).resolves.toBe(
      "unauthorized",
    );
    await expect(createAuthenticatedClient(unavailable).refreshAccessToken()).resolves.toBe(
      "unavailable",
    );
  });

  it("shares one refresh while concurrent resource preflights observe an expired token", async () => {
    let releaseRefresh: (() => void) | undefined;
    let refreshCalls = 0;
    const request = vi.fn<typeof fetch>(async (input) => {
      const pathname = new URL((input as Request).url).pathname;
      if (pathname === "/api/v1/auth/me") {
        return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
      }
      refreshCalls += 1;
      return new Promise<Response>((resolve) => {
        releaseRefresh = () => resolve(new Response(null, { status: 204 }));
      });
    });
    const client = createAuthenticatedClient(request);

    const first = client.ensureAccessToken();
    const second = client.ensureAccessToken();
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    releaseRefresh?.();

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(refreshCalls).toBe(1);
  });
});
