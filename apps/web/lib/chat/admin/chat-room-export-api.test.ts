import { describe, expect, it, vi } from "vitest";
import { ChatApiError } from "../chat-fetch";
import {
  ChatRoomExportResponseError,
  createChatRoomExportApi,
  resolveChatRoomExportFilename,
} from "./chat-room-export-api";

type FetchRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

describe("ChatRoomExportApi", () => {
  it.each(["FULL", "INCREMENTAL"] as const)("%s ZIP을 BFF에서 다운로드한다", async (mode) => {
    const zip = new Uint8Array([80, 75, 3, 4]);
    const request = vi.fn<FetchRequest>(
      async () =>
        new Response(zip, {
          status: 200,
          headers: {
            "Content-Disposition": 'attachment; filename="chat-export-export-01.zip"',
            "Content-Type": "application/zip",
            "X-Export-Id": "export-01",
            "X-Export-SHA256": "a".repeat(64),
          },
        }),
    );
    const api = createChatRoomExportApi(request);

    const result = await api.download({ roomId: "room-01", mode });

    expect(request).toHaveBeenCalledOnce();
    const [path, init] = request.mock.calls[0]!;
    expect(path).toBe("/api/chat/admin/rooms/room-01/exports");
    expect(init).toMatchObject({
      method: "POST",
      body: JSON.stringify({ mode }),
      cache: "no-store",
      credentials: "same-origin",
    });
    expect(init?.signal).toBeUndefined();
    expect(new Headers(init?.headers)).toEqual(
      new Headers({
        Accept: "application/zip",
        "Content-Type": "application/json",
      }),
    );
    expect(result).toMatchObject({
      exportId: "export-01",
      filename: "chat-export-export-01.zip",
      sha256: "a".repeat(64),
    });
    await expect(result.blob.arrayBuffer()).resolves.toEqual(zip.buffer);
  });

  it("응답 헤더가 없으면 안전한 fallback 파일명을 사용한다", async () => {
    const api = createChatRoomExportApi(
      async () =>
        new Response(new Uint8Array(), {
          headers: { "Content-Type": "application/zip" },
        }),
    );

    await expect(api.download({ roomId: "room-01", mode: "FULL" })).resolves.toMatchObject({
      exportId: null,
      filename: "chat-export-download.zip",
      sha256: null,
    });
  });

  it("서버 파일명에서 경로와 제어 문자를 제거한다", () => {
    expect(
      resolveChatRoomExportFilename('attachment; filename="../audit\u0000.zip"', "export-01"),
    ).toBe("audit.zip");
  });

  it("ProblemDetail 오류를 ChatApiError로 복원한다", async () => {
    const api = createChatRoomExportApi(async () =>
      Response.json(
        {
          type: "urn:hamcheeze:problem:chat-export-base-not-found",
          title: "Chat export failed",
          status: 409,
          detail: "A successful FULL export is required.",
          instance: "/api/v1/admin/rooms/room-01/exports",
          code: "CHAT_EXPORT_BASE_NOT_FOUND",
          replayed: false,
          retryable: false,
        },
        {
          status: 409,
          headers: { "Content-Type": "application/problem+json" },
        },
      ),
    );

    const promise = api.download({ roomId: "room-01", mode: "INCREMENTAL" });

    await expect(promise).rejects.toMatchObject({
      code: "CHAT_EXPORT_BASE_NOT_FOUND",
      retryable: false,
      status: 409,
    });
    await expect(promise).rejects.toBeInstanceOf(ChatApiError);
  });

  it("성공 응답이 ZIP이 아니면 계약 오류로 처리한다", async () => {
    const api = createChatRoomExportApi(async () => Response.json({ ok: true }));

    await expect(api.download({ roomId: "room-01", mode: "FULL" })).rejects.toBeInstanceOf(
      ChatRoomExportResponseError,
    );
  });

  it.each([
    { header: "X-Export-Id", value: "" },
    { header: "X-Export-SHA256", value: "A".repeat(64) },
  ])("잘못된 $header 응답 헤더를 계약 오류로 처리한다", async ({ header, value }) => {
    const api = createChatRoomExportApi(
      async () =>
        new Response(new Uint8Array(), {
          headers: {
            "Content-Type": "application/zip",
            [header]: value,
          },
        }),
    );

    await expect(api.download({ roomId: "room-01", mode: "FULL" })).rejects.toBeInstanceOf(
      ChatRoomExportResponseError,
    );
  });

  it("검증되지 않은 roomId와 추가 요청 필드를 BFF 호출 전에 거절한다", async () => {
    const request = vi.fn<FetchRequest>();
    const api = createChatRoomExportApi(request);

    await expect(api.download({ roomId: "../room", mode: "FULL" })).rejects.toMatchObject({
      name: "ZodError",
    });
    await expect(
      api.download({ roomId: "room-01", mode: "FULL", baseExportId: "export-01" } as never),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(request).not.toHaveBeenCalled();
  });
});
