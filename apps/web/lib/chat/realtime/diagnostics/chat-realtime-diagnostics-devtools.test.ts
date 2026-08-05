import { describe, expect, it, vi } from "vitest";
import type { ChatRealtimeDiagnosticSnapshot } from "./chat-realtime-diagnostic-events";
import {
  attachChatRealtimeDiagnosticsDevtools,
  createChatRealtimeDiagnosticFileName,
  serializeChatRealtimeDiagnosticSnapshot,
  type ChatRealtimeDiagnosticsDevtools,
} from "./chat-realtime-diagnostics-devtools";

const SNAPSHOT: ChatRealtimeDiagnosticSnapshot = {
  schemaVersion: 1,
  capturedAt: "2026-08-05T07:30:12.123Z",
  capacity: 500,
  droppedEventCount: 0,
  rejectedEventCount: 0,
  events: [],
};

describe("chat realtime diagnostics devtools", () => {
  it("개발 환경에서만 snapshot, clear, download API를 등록하고 정리한다", async () => {
    const getDiagnosticSnapshot = vi.fn(async () => SNAPSHOT);
    const clearDiagnostics = vi.fn(async () => undefined);
    const downloadSnapshot = vi.fn();
    const target: { __CHAT_REALTIME_DIAGNOSTICS__?: ChatRealtimeDiagnosticsDevtools } = {};
    const transport = {
      getDiagnosticSnapshot,
      clearDiagnostics,
    };

    const detach = attachChatRealtimeDiagnosticsDevtools(transport, target, {
      enabled: true,
      downloadSnapshot,
    });

    await expect(target.__CHAT_REALTIME_DIAGNOSTICS__?.snapshot()).resolves.toBe(SNAPSHOT);
    await target.__CHAT_REALTIME_DIAGNOSTICS__?.clear();
    await target.__CHAT_REALTIME_DIAGNOSTICS__?.download();

    expect(clearDiagnostics).toHaveBeenCalledTimes(1);
    expect(downloadSnapshot).toHaveBeenCalledWith(SNAPSHOT);

    detach();
    expect(target.__CHAT_REALTIME_DIAGNOSTICS__).toBeUndefined();
  });

  it("비활성화 환경에서는 전역 API를 등록하지 않는다", () => {
    const existing = {
      snapshot: vi.fn(),
      clear: vi.fn(),
      download: vi.fn(),
    } as unknown as ChatRealtimeDiagnosticsDevtools;
    const target = { __CHAT_REALTIME_DIAGNOSTICS__: existing };

    const detach = attachChatRealtimeDiagnosticsDevtools(
      {
        clearDiagnostics: vi.fn(),
        getDiagnosticSnapshot: vi.fn(),
      },
      target,
      {
        enabled: false,
      },
    );

    expect(target.__CHAT_REALTIME_DIAGNOSTICS__).toBe(existing);
    detach();
    expect(target.__CHAT_REALTIME_DIAGNOSTICS__).toBe(existing);
  });

  it("snapshot JSON과 파일명을 분석하기 쉬운 형태로 만든다", () => {
    expect(JSON.parse(serializeChatRealtimeDiagnosticSnapshot(SNAPSHOT))).toEqual(SNAPSHOT);
    expect(createChatRealtimeDiagnosticFileName(SNAPSHOT.capturedAt)).toBe(
      "chat-realtime-diagnostics-2026-08-05T07-30-12-123Z.json",
    );
  });
});
