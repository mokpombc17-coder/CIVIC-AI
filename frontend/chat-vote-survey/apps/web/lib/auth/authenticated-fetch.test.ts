import { describe, expect, it, vi } from "vitest";
import { createAuthenticatedClient, createAuthenticatedFetch } from "./authenticated-fetch";

describe("createAuthenticatedFetch", () => {
  it("Access Token을 갱신하고 리소스 요청을 한 번만 재시도한다", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ code: "UNAUTHORIZED" }, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ status: "ok" }));

    const response = await createAuthenticatedFetch(request)(
      "https://civic.example/api/v1/me/tasks",
    );

    expect(response.status).toBe(200);
    expect(request).toHaveBeenCalledTimes(3);
    expect(new URL((request.mock.calls[1]![0] as Request).url).pathname).toBe(
      "/api/v1/auth/refresh",
    );
    expect((request.mock.calls[2]![0] as Request).url).toBe(
      "https://civic.example/api/v1/me/tasks",
    );
  });

  it("공유 갱신이 성공하면 완료 알림을 한 번만 전달한다", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ code: "UNAUTHORIZED" }, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ status: "ok" }));
    const onAccessTokenRefreshed = vi.fn();
    const client = createAuthenticatedClient(
      request,
      async () => undefined,
      onAccessTokenRefreshed,
    );

    await client.fetch("https://civic.example/api/v1/rooms");

    expect(onAccessTokenRefreshed).toHaveBeenCalledTimes(1);
  });

  it("갱신할 수 없으면 원래 401 응답을 반환한다", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ code: "UNAUTHORIZED" }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ code: "UNAUTHORIZED" }, { status: 401 }));

    const response = await createAuthenticatedFetch(request)("https://civic.example/api/v1/rooms");

    expect(response.status).toBe(401);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("Auth 요청에서는 재귀적으로 갱신하지 않는다", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ code: "UNAUTHORIZED" }, { status: 401 }));

    await createAuthenticatedFetch(request)("https://civic.example/api/v1/auth/me");

    expect(request).toHaveBeenCalledTimes(1);
  });

  it("동시에 발생한 요청은 하나의 Refresh Token 회전을 공유한다", async () => {
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

    const first = authenticatedRequest("https://civic.example/api/v1/rooms");
    const second = authenticatedRequest("https://civic.example/api/v1/me/tasks");
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    releaseRefresh?.();

    await expect(Promise.all([first, second])).resolves.toMatchObject([
      { status: 200 },
      { status: 200 },
    ]);
    expect(refreshCalls).toBe(1);
  });

  it("서로 다른 Resource Server의 갱신은 origin별로 분리한다", async () => {
    const refreshedOrigins: string[] = [];
    const resourceAttempts = new Map<string, number>();
    const request = vi.fn<typeof fetch>(async (input) => {
      const url = new URL((input as Request).url);

      if (url.pathname === "/api/v1/auth/refresh") {
        refreshedOrigins.push(url.origin);
        return new Response(null, { status: 204 });
      }

      const attempts = resourceAttempts.get(url.origin) ?? 0;
      resourceAttempts.set(url.origin, attempts + 1);
      return attempts === 0
        ? Response.json({ code: "UNAUTHORIZED" }, { status: 401 })
        : Response.json({ status: "ok" });
    });
    const authenticatedRequest = createAuthenticatedFetch(request);

    await Promise.all([
      authenticatedRequest("https://chat.civic.example/api/v1/rooms"),
      authenticatedRequest("https://vote.civic.example/api/v1/me/tasks"),
    ]);

    expect(refreshedOrigins.sort()).toEqual([
      "https://chat.civic.example",
      "https://vote.civic.example",
    ]);
  });

  it("다른 탭의 409 회전을 기다린 뒤 리소스 요청만 재시도한다", async () => {
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
    )("https://civic.example/api/v1/rooms");

    expect(response.status).toBe(200);
    expect(refreshCalls).toBe(1);
    expect(resourceCalls).toBe(2);
    expect(pause.mock.calls).toEqual([[100], [200]]);
  });

  it("409 회전이 끝내 확인되지 않으면 원래 401을 반환한다", async () => {
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
    )("https://civic.example/api/v1/me/tasks");

    expect(response.status).toBe(401);
    expect(refreshCalls).toBe(1);
    expect(resourceCalls).toBe(1);
    expect(pause.mock.calls).toEqual([[100], [200], [400]]);
  });

  it("유효한 Access Token은 사전 확인 중 회전하지 않는다", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ subject: "user-1" }));

    await expect(createAuthenticatedClient(request).ensureAccessToken()).resolves.toBe(true);

    expect(request).toHaveBeenCalledTimes(1);
    expect(new URL((request.mock.calls[0]![0] as Request).url).pathname).toBe("/api/v1/auth/me");
  });

  it("만료된 Access Token은 사전 확인 중 회전한다", async () => {
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

  it("지정한 Resource Server에서 access token 상태를 확인하고 갱신한다", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ code: "UNAUTHORIZED" }, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(
      createAuthenticatedClient(request).recoverAccessToken("https://chat.civic.example/api/v1"),
    ).resolves.toBe("authenticated");

    expect(new URL((request.mock.calls[0]![0] as Request).url).origin).toBe(
      "https://chat.civic.example",
    );
    expect(new URL((request.mock.calls[1]![0] as Request).url).origin).toBe(
      "https://chat.civic.example",
    );
    expect((request.mock.calls[0]![0] as Request).credentials).toBe("include");
    expect((request.mock.calls[1]![0] as Request).credentials).toBe("include");
  });

  it("refresh 인증이 거절되면 실제 로그인 필요 상태로 구분한다", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ code: "UNAUTHORIZED" }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ code: "UNAUTHORIZED" }, { status: 401 }));

    await expect(createAuthenticatedClient(request).recoverAccessToken()).resolves.toBe(
      "authentication-required",
    );
  });

  it("네트워크와 서버 오류는 로그인 만료가 아닌 일시 오류로 구분한다", async () => {
    const networkRequest = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));
    const serverRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ code: "INTERNAL_ERROR" }, { status: 503 }));

    await expect(createAuthenticatedClient(networkRequest).recoverAccessToken()).resolves.toBe(
      "temporarily-unavailable",
    );
    await expect(createAuthenticatedClient(serverRequest).recoverAccessToken()).resolves.toBe(
      "temporarily-unavailable",
    );
  });

  it("동시 사전 확인도 하나의 갱신을 공유한다", async () => {
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
