import { describe, expect, it, vi } from "vitest";
import { createAuthenticatedClient, createAuthenticatedFetch } from "./authenticated-fetch";
import { sendAuthMessage } from "./auth-session-events";

describe("createAuthenticatedFetch", () => {
  it("does not replay an old account's RAG request after LOGIN during refresh", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockImplementationOnce(async () => {
        sendAuthMessage("LOGIN");
        return new Response(null, { status: 204 });
      });
    const response = await createAuthenticatedFetch(request)(
      "https://civic.example/api/v1/rag/queries",
      { method: "POST", body: "old question" },
    );
    expect(response.status).toBe(401);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not refresh an aborted conversation request", async () => {
    const controller = new AbortController();
    const request = vi.fn<typeof fetch>().mockImplementationOnce(async () => {
      controller.abort();
      return new Response(null, { status: 401 });
    });
    await createAuthenticatedFetch(request)("https://civic.example/api/v1/rag/queries", {
      signal: controller.signal,
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it.each(["LOGIN", "LOGOUT", "abort"] as const)(
    "does not replay a request when %s arrives while disposing the 401 body",
    async (change) => {
      const controller = new AbortController();
      const unauthorized = new Response(
        new ReadableStream({
          cancel() {
            if (change === "abort") controller.abort();
            else sendAuthMessage(change);
          },
        }),
        { status: 401 },
      );
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(unauthorized)
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(Response.json({ status: "unexpected replay" }));

      const response = await createAuthenticatedFetch(request)(
        "https://civic.example/api/v1/rag/queries",
        { method: "POST", body: "old question", signal: controller.signal },
      );

      expect(request).toHaveBeenCalledTimes(2);
      expect(response.status).toBe(401);
    },
  );

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
    const clearUserId = vi.fn();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ code: "UNAUTHORIZED" }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ code: "UNAUTHORIZED" }, { status: 401 }));

    const response = await createAuthenticatedFetch(
      request,
      undefined,
      clearUserId,
    )("https://civic.example/api/v1/rag/queries/job-1");

    expect(response.status).toBe(401);
    expect(request).toHaveBeenCalledTimes(2);
    expect(clearUserId).toHaveBeenCalledOnce();
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

  it("does not replay a credential-checking request after its own 401", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ subject: "user-1" }))
      .mockResolvedValueOnce(
        Response.json({ detail: "Authentication code is invalid" }, { status: 401 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const response = await createAuthenticatedClient(request).fetchOnce(
      "https://civic.example/api/v1/account/2fa/enable",
      { method: "POST", body: JSON.stringify({ code: "000000" }) },
    );

    expect(response.status).toBe(401);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.map(([input]) => new URL((input as Request).url).pathname)).toEqual([
      "/api/v1/auth/me",
      "/api/v1/account/2fa/enable",
    ]);
  });

  it("refreshes an expired access token before sending a credential-checking request", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ code: "UNAUTHORIZED" }, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const response = await createAuthenticatedClient(request).fetchOnce(
      "https://civic.example/api/v1/account/2fa/enable",
      { method: "POST", body: JSON.stringify({ code: "123456" }) },
    );

    expect(response.status).toBe(204);
    expect(request.mock.calls.map(([input]) => new URL((input as Request).url).pathname)).toEqual([
      "/api/v1/auth/me",
      "/api/v1/auth/refresh",
      "/api/v1/account/2fa/enable",
    ]);
  });

  describe("fetchOnce guards", () => {
    const enable = "https://civic.example/api/v1/account/2fa/enable";
    const send = { method: "POST", body: JSON.stringify({ code: "123456" }) };
    const paths = (request: ReturnType<typeof vi.fn<typeof fetch>>) =>
      request.mock.calls.map(([input]) => new URL((input as Request).url).pathname);

    it.each([401, 403, 503])(
      "does not send the request when the refresh fails with %i",
      async (status) => {
        const request = vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(Response.json({ code: "UNAUTHORIZED" }, { status: 401 }))
          .mockResolvedValueOnce(new Response(null, { status }));

        const response = await createAuthenticatedClient(request).fetchOnce(enable, send);

        expect(response.status).toBe(401);
        expect(paths(request)).toEqual(["/api/v1/auth/me", "/api/v1/auth/refresh"]);
      },
    );

    it("returns a non-401 preflight failure without sending the request", async () => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(null, { status: 503 }));

      const response = await createAuthenticatedClient(request).fetchOnce(enable, send);

      expect(response.status).toBe(503);
      expect(paths(request)).toEqual(["/api/v1/auth/me"]);
    });

    it("does not send the request when the preflight cannot reach Main/Auth", async () => {
      const request = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("offline"));

      await expect(createAuthenticatedClient(request).fetchOnce(enable, send)).rejects.toThrow(
        "offline",
      );
      expect(paths(request)).toEqual(["/api/v1/auth/me"]);
    });

    it("does not send the request when a 409 rotation never becomes visible", async () => {
      const request = vi.fn<typeof fetch>(async (input) =>
        new URL((input as Request).url).pathname === "/api/v1/auth/refresh"
          ? Response.json({ code: "REFRESH_CONFLICT" }, { status: 409 })
          : Response.json({ code: "UNAUTHORIZED" }, { status: 401 }),
      );

      const response = await createAuthenticatedClient(request, async () => undefined).fetchOnce(
        enable,
        send,
      );

      expect(response.status).toBe(401);
      expect(paths(request)).not.toContain("/api/v1/account/2fa/enable");
    });

    it.each(["LOGIN", "LOGOUT"] as const)(
      "does not send an old account's request when %s arrives during the preflight",
      async (change) => {
        const request = vi.fn<typeof fetch>().mockImplementationOnce(async () => {
          sendAuthMessage(change);
          return Response.json({ subject: "user-1" });
        });

        const response = await createAuthenticatedClient(request).fetchOnce(enable, send);

        expect(response.status).toBe(401);
        expect(paths(request)).toEqual(["/api/v1/auth/me"]);
      },
    );

    it("does not send an old account's request when LOGIN arrives during the refresh", async () => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({ code: "UNAUTHORIZED" }, { status: 401 }))
        .mockImplementationOnce(async () => {
          sendAuthMessage("LOGIN");
          return new Response(null, { status: 204 });
        });

      const response = await createAuthenticatedClient(request).fetchOnce(enable, send);

      expect(response.status).toBe(401);
      expect(paths(request)).toEqual(["/api/v1/auth/me", "/api/v1/auth/refresh"]);
    });

    it("does not contact Main/Auth for an already aborted request", async () => {
      const request = vi.fn<typeof fetch>();
      const controller = new AbortController();
      controller.abort();

      await expect(
        createAuthenticatedClient(request).fetchOnce(enable, {
          ...send,
          signal: controller.signal,
        }),
      ).rejects.toThrow();
      expect(request).not.toHaveBeenCalled();
    });

    it("does not abort a request that was already sent", async () => {
      let sent: Request | undefined;
      let release: (() => void) | undefined;
      const request = vi.fn<typeof fetch>(async (input) => {
        const pathname = new URL((input as Request).url).pathname;
        if (pathname === "/api/v1/auth/me") return Response.json({ subject: "user-1" });
        sent = input as Request;
        return new Promise<Response>((resolve) => {
          release = () => resolve(new Response(null, { status: 204 }));
        });
      });
      const controller = new AbortController();

      const response = createAuthenticatedClient(request).fetchOnce(enable, {
        ...send,
        signal: controller.signal,
      });
      await vi.waitFor(() => expect(release).toBeDefined());
      controller.abort();
      release?.();

      await expect(response).resolves.toHaveProperty("status", 204);
      expect(sent?.signal.aborted).toBe(false);
    });

    it("lets one caller abort while another caller keeps the shared refresh", async () => {
      let releaseRefresh: (() => void) | undefined;
      const request = vi.fn<typeof fetch>(async (input) => {
        const pathname = new URL((input as Request).url).pathname;
        if (pathname === "/api/v1/auth/me") {
          return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
        }
        if (pathname === "/api/v1/auth/refresh") {
          return new Promise<Response>((resolve) => {
            releaseRefresh = () => resolve(new Response(null, { status: 204 }));
          });
        }
        return new Response(null, { status: 204 });
      });
      const client = createAuthenticatedClient(request);
      const controller = new AbortController();

      const aborted = client.fetchOnce(enable, { ...send, signal: controller.signal });
      const kept = client.fetchOnce(enable, send);
      await vi.waitFor(() => expect(releaseRefresh).toBeDefined());
      controller.abort();
      await expect(aborted).rejects.toThrow();
      releaseRefresh?.();

      await expect(kept).resolves.toHaveProperty("status", 204);
      expect(paths(request).filter((path) => path === "/api/v1/auth/refresh")).toHaveLength(1);
      expect(paths(request).filter((path) => path === "/api/v1/account/2fa/enable")).toHaveLength(
        1,
      );
    });
  });

  describe("refreshSession", () => {
    it.each([
      [204, "refreshed"],
      [401, "rejected"],
      [403, "rejected"],
      [429, "unavailable"],
      [503, "unavailable"],
    ] as const)("reports a %i refresh as %s", async (status, outcome) => {
      const clearUserId = vi.fn();
      const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status }));

      await expect(
        createAuthenticatedClient(request, async () => undefined, clearUserId).refreshSession(),
      ).resolves.toBe(outcome);
      expect(clearUserId).toHaveBeenCalledTimes(outcome === "rejected" ? 1 : 0);
    });

    it("reports an unreachable Main/Auth as unavailable", async () => {
      const request = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("offline"));

      await expect(createAuthenticatedClient(request).refreshSession()).resolves.toBe(
        "unavailable",
      );
    });

    it("joins another tab's 409 rotation instead of signing out", async () => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({ code: "REFRESH_CONFLICT" }, { status: 409 }))
        .mockResolvedValueOnce(Response.json({ subject: "user-1" }));

      await expect(
        createAuthenticatedClient(request, async () => undefined).refreshSession(),
      ).resolves.toBe("refreshed");
    });

    it("reports a 409 rotation that never becomes visible as rejected", async () => {
      const request = vi.fn<typeof fetch>(async (input) =>
        new URL((input as Request).url).pathname === "/api/v1/auth/refresh"
          ? Response.json({ code: "REFRESH_CONFLICT" }, { status: 409 })
          : Response.json({ code: "UNAUTHORIZED" }, { status: 401 }),
      );

      await expect(
        createAuthenticatedClient(request, async () => undefined).refreshSession(),
      ).resolves.toBe("rejected");
    });
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
