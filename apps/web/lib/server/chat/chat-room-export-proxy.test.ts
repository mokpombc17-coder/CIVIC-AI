import { describe, expect, it, vi } from "vitest";
import { proxyChatRoomExport } from "./chat-room-export-proxy";

vi.mock("server-only", () => ({}));

type FetchRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const routeUrl = "https://web.example.test/api/chat/admin/rooms/room-01/exports";

describe("proxyChatRoomExport", () => {
  it("HttpOnly token을 Bearer로 전달하고 ZIP stream과 허용 헤더를 보존한다", async () => {
    const zip = new Uint8Array([80, 75, 3, 4]);
    const requestBackend = vi.fn<FetchRequest>(
      async () =>
        new Response(zip, {
          status: 200,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Content-Disposition": 'attachment; filename="chat-export-export-01.zip"',
            "Content-Length": String(zip.byteLength),
            "Content-Type": "application/zip",
            Pragma: "no-cache",
            "Set-Cookie": "must-not-be-forwarded=true",
            "X-Content-Type-Options": "nosniff",
            "X-Export-Id": "export-01",
            "X-Export-SHA256": "a".repeat(64),
          },
        }),
    );

    const response = await proxyChatRoomExport({
      accessToken: "secret-token",
      apiBaseUrl: "https://chat.example.test/api/v1",
      request: exportRequest({ mode: "FULL" }),
      requestBackend,
      roomId: "room-01",
    });

    expect(requestBackend).toHaveBeenCalledOnce();
    const [url, init] = requestBackend.mock.calls[0]!;
    expect(String(url)).toBe("https://chat.example.test/api/v1/admin/rooms/room-01/exports");
    expect(init).toMatchObject({
      method: "POST",
      body: JSON.stringify({ mode: "FULL" }),
      cache: "no-store",
    });
    expect(init?.signal).toBeUndefined();
    expect(new Headers(init?.headers)).toEqual(
      new Headers({
        Accept: "application/zip",
        Authorization: "Bearer secret-token",
        "Content-Type": "application/json",
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="chat-export-export-01.zip"',
    );
    expect(response.headers.get("X-Export-Id")).toBe("export-01");
    expect(response.headers.get("X-Export-SHA256")).toBe("a".repeat(64));
    expect(response.headers.get("Set-Cookie")).toBeNull();
    await expect(response.arrayBuffer()).resolves.toEqual(zip.buffer);
  });

  it.each(["FULL", "INCREMENTAL"] as const)("%s mode만 Backend에 전달한다", async (mode) => {
    const requestBackend = vi.fn<FetchRequest>(
      async () =>
        new Response(new Uint8Array(), {
          status: 200,
          headers: { "Content-Type": "application/zip" },
        }),
    );

    await proxyChatRoomExport({
      accessToken: "token",
      request: exportRequest({ mode }),
      requestBackend,
      roomId: "room-01",
    });

    expect(requestBackend).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ body: JSON.stringify({ mode }) }),
    );
  });

  it("Backend ProblemDetail status, body와 Content-Type을 stream으로 전달한다", async () => {
    const problem = {
      type: "urn:hamcheeze:problem:chat-export-base-not-found",
      title: "Chat export failed",
      status: 409,
      detail: "A successful FULL export is required.",
      instance: "/api/v1/admin/rooms/room-01/exports",
      code: "CHAT_EXPORT_BASE_NOT_FOUND",
      replayed: false,
      retryable: false,
    };
    const response = await proxyChatRoomExport({
      accessToken: "token",
      request: exportRequest({ mode: "INCREMENTAL" }),
      requestBackend: async () =>
        Response.json(problem, {
          status: 409,
          headers: { "Content-Type": "application/problem+json" },
        }),
      roomId: "room-01",
    });

    expect(response.status).toBe(409);
    expect(response.headers.get("Content-Type")).toContain("application/problem+json");
    await expect(response.json()).resolves.toEqual(problem);
  });

  it("same-origin Origin이 아니면 Backend를 호출하지 않는다", async () => {
    const requestBackend = vi.fn<FetchRequest>();
    const response = await proxyChatRoomExport({
      accessToken: "token",
      request: exportRequest({ mode: "FULL" }, "https://attacker.example.test"),
      requestBackend,
      roomId: "room-01",
    });

    expect(response.status).toBe(403);
    expect(requestBackend).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ code: "ACCESS_DENIED" });
  });

  it("인증 쿠키가 없으면 Backend를 호출하지 않는다", async () => {
    const requestBackend = vi.fn<FetchRequest>();
    const response = await proxyChatRoomExport({
      accessToken: undefined,
      request: exportRequest({ mode: "FULL" }),
      requestBackend,
      roomId: "room-01",
    });

    expect(response.status).toBe(401);
    expect(requestBackend).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it.each([
    { body: { mode: "full" }, roomId: "room-01" },
    { body: { mode: "FULL", baseExportId: "export-01" }, roomId: "room-01" },
    { body: { mode: "FULL" }, roomId: "../room" },
  ])("잘못된 요청을 Backend 호출 전에 거절한다: $body", async ({ body, roomId }) => {
    const requestBackend = vi.fn<FetchRequest>();
    const response = await proxyChatRoomExport({
      accessToken: "token",
      request: exportRequest(body),
      requestBackend,
      roomId,
    });

    expect(response.status).toBe(400);
    expect(requestBackend).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("Backend 연결 실패를 retryable 503으로 변환한다", async () => {
    const response = await proxyChatRoomExport({
      accessToken: "token",
      request: exportRequest({ mode: "FULL" }),
      requestBackend: async () => {
        throw new TypeError("fetch failed");
      },
      roomId: "room-01",
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "CHAT_EXPORT_UNAVAILABLE",
      retryable: true,
    });
  });
});

function exportRequest(body: unknown, origin = "https://web.example.test"): Request {
  return new Request(routeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify(body),
  });
}
