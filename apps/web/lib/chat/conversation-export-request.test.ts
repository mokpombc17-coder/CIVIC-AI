import { describe, expect, it, vi } from "vitest";
import { formatAdminProblem } from "@/lib/admin/domain-contracts";
import { fetchConversationExportWithRetry } from "./conversation-export-request";

const exportUrl = "/api/v1/admin/rooms/room-1/conversation-exports";

describe("conversation export request retry", () => {
  it("재시도 가능한 503 응답 뒤에 Export 요청을 다시 보낸다", async () => {
    const responses = [
      problemResponse(503, "CHAT_EXPORT_UNAVAILABLE", true),
      problemResponse(503, "CHAT_EXPORT_UNAVAILABLE", true),
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "application/zip" },
      }),
    ];
    const request = vi.fn(async () => responses.shift() as Response);
    const pause = vi.fn(async (_delayMs: number, _signal?: AbortSignal) => undefined);

    const response = await fetchConversationExportWithRetry(
      exportUrl,
      { method: "POST" },
      {
        pauseBackend: pause,
        requestBackend: request,
        retryDelaysMs: [100, 300, 1_000],
      },
    );

    expect(response.status).toBe(200);
    expect(request).toHaveBeenCalledTimes(3);
    expect(pause.mock.calls.map(([delayMs]) => delayMs)).toEqual([100, 300]);
  });

  it("일시적인 네트워크 오류 뒤에도 요청을 다시 보낸다", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const pause = vi.fn(async (_delayMs: number, _signal?: AbortSignal) => undefined);

    const response = await fetchConversationExportWithRetry(
      exportUrl,
      { method: "POST" },
      { pauseBackend: pause, requestBackend: request, retryDelaysMs: [150] },
    );

    expect(response.status).toBe(200);
    expect(request).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledWith(150, undefined);
  });

  it("재시도할 수 없는 클라이언트 오류는 그대로 반환한다", async () => {
    const request = vi.fn(async () => problemResponse(400, "INVALID_REQUEST", false));
    const pause = vi.fn(async (_delayMs: number, _signal?: AbortSignal) => undefined);

    const response = await fetchConversationExportWithRetry(
      exportUrl,
      { method: "POST" },
      { pauseBackend: pause, requestBackend: request, retryDelaysMs: [100] },
    );

    expect(response.status).toBe(400);
    expect(request).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled();
  });

  it("서버가 재시도 불가로 표시한 503 응답은 반복하지 않는다", async () => {
    const request = vi.fn(async () =>
      problemResponse(503, "CHAT_EXPORT_LEDGER_INCONSISTENT", false),
    );
    const pause = vi.fn(async (_delayMs: number, _signal?: AbortSignal) => undefined);

    const response = await fetchConversationExportWithRetry(
      exportUrl,
      { method: "POST" },
      { pauseBackend: pause, requestBackend: request, retryDelaysMs: [100] },
    );

    expect(response.status).toBe(503);
    expect(request).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled();
  });

  it("재시도 횟수를 소진하면 마지막 오류 본문을 호출자에게 보존한다", async () => {
    const request = vi.fn(async () => problemResponse(503, "CHAT_EXPORT_UNAVAILABLE", true));
    const pause = vi.fn(async (_delayMs: number, _signal?: AbortSignal) => undefined);

    const response = await fetchConversationExportWithRetry(
      exportUrl,
      { method: "POST" },
      { pauseBackend: pause, requestBackend: request, retryDelaysMs: [100, 300] },
    );

    expect(request).toHaveBeenCalledTimes(3);
    await expect(response.json()).resolves.toMatchObject({
      code: "CHAT_EXPORT_UNAVAILABLE",
      retryable: true,
    });
  });

  it("사용자가 요청을 취소하면 대기 중인 재시도도 중단한다", async () => {
    const controller = new AbortController();
    const request = vi.fn(async () => problemResponse(503, "CHAT_EXPORT_UNAVAILABLE", true));
    const pause = vi.fn(async (_delayMs: number, signal?: AbortSignal) => {
      controller.abort();
      signal?.throwIfAborted();
    });

    await expect(
      fetchConversationExportWithRetry(
        exportUrl,
        { method: "POST", signal: controller.signal },
        { pauseBackend: pause, requestBackend: request, retryDelaysMs: [100, 300] },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(request).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("재시도를 모두 마친 용량 오류는 한국어로 안내한다", () => {
    expect(
      formatAdminProblem({
        code: "CHAT_EXPORT_UNAVAILABLE",
        detail: "Chat export capacity is currently unavailable",
        status: 503,
        violations: [],
      }),
    ).toBe(
      "대화 분석 서버가 다른 작업을 처리 중입니다. 자동 재시도를 마쳤지만 아직 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    );
  });
});

function problemResponse(status: number, code: string, retryable: boolean): Response {
  return Response.json(
    { code, detail: "Chat export capacity is currently unavailable", retryable, status },
    { status },
  );
}
