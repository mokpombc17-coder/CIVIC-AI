import { describe, expect, it } from "vitest";
import {
  ChatConnectionAttemptDiagnostics,
  sanitizeDiagnosticText,
} from "./chat-connection-attempt-diagnostics";
import { ChatRealtimeDiagnosticStore } from "./chat-realtime-diagnostic-store";

function createAttempts({
  createDiagnosticId = () => "attempt-1",
  monotonicNow = () => 0,
}: {
  createDiagnosticId?: () => string;
  monotonicNow?: () => number;
} = {}) {
  const store = new ChatRealtimeDiagnosticStore({ runtimeInstanceId: "runtime-1", enabled: true });
  const attempts = new ChatConnectionAttemptDiagnostics(store, createDiagnosticId, monotonicNow);

  return { attempts, store };
}

describe("ChatConnectionAttemptDiagnostics", () => {
  it("연결 시도를 시작하고 WebSocket close 기록 뒤 시도 식별자를 비운다", () => {
    let now = 100;
    const { attempts, store } = createAttempts({ monotonicNow: () => now });

    attempts.beginAttempt("initial-attach", "idle");
    now = 175;

    expect(attempts.currentAttemptId).toBe("attempt-1");
    expect(attempts.getConnectionDurationMs()).toBe(75);

    attempts.recordWebSocketClose(
      { code: 1006, reason: "NETWORK\nDOWN", wasClean: false } as CloseEvent,
      "connected",
      "reconnecting",
    );

    expect(attempts.currentAttemptId).toBeNull();
    expect(store.getSnapshot().events).toMatchObject([
      {
        event: "connection.requested",
        connectionAttemptId: "attempt-1",
        trigger: "initial-attach",
        statusBefore: "idle",
      },
      {
        event: "websocket.closed",
        connectionAttemptId: "attempt-1",
        closeCode: 1006,
        closeReason: "NETWORK DOWN",
        wasClean: false,
        statusBefore: "connected",
        reconnectDecision: "reconnecting",
      },
    ]);
  });

  it("진단 ID 생성이 실패하거나 비정상 값이면 순번 기반 ID를 사용한다", () => {
    const ids = [() => "  ", () => "x".repeat(129), () => " attempt-ok "];
    const { attempts } = createAttempts({
      createDiagnosticId: () => {
        const next = ids.shift();

        if (!next) {
          throw new Error("random source unavailable");
        }
        return next();
      },
    });

    expect(attempts.nextDiagnosticId()).toBe("diagnostic-1");
    expect(attempts.nextDiagnosticId()).toBe("diagnostic-2");
    expect(attempts.nextDiagnosticId()).toBe("attempt-ok");
    expect(attempts.nextDiagnosticId()).toBe("diagnostic-4");
  });

  it("monotonic clock 오류는 연결 시간을 0으로 기록한다", () => {
    const { attempts } = createAttempts({
      monotonicNow: () => {
        throw new Error("clock unavailable");
      },
    });

    attempts.beginAttempt("manual", "disconnected");

    expect(attempts.currentAttemptId).toBe("attempt-1");
    expect(attempts.getConnectionDurationMs()).toBe(0);
  });
});

describe("sanitizeDiagnosticText", () => {
  it("제어 문자를 공백으로 바꾸고 앞뒤 공백을 제거한 뒤 256자로 자른다", () => {
    expect(sanitizeDiagnosticText(`\tROOM${String.fromCharCode(0)}CLOSED\n`)).toBe("ROOM CLOSED");
    expect(sanitizeDiagnosticText("x".repeat(300))).toHaveLength(256);
  });
});
