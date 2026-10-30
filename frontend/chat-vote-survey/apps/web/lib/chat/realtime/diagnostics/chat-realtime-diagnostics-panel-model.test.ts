import { describe, expect, it } from "vitest";
import type {
  ChatRealtimeDiagnosticEvent,
  ChatRealtimeDiagnosticSnapshot,
} from "./chat-realtime-diagnostic-events";
import {
  createChatRealtimeDiagnosticEventPreview,
  createChatRealtimeDiagnosticsSummary,
  getVisibleChatRealtimeDiagnosticEvents,
} from "./chat-realtime-diagnostics-panel-model";

describe("chat realtime diagnostics panel model", () => {
  it("level별 이벤트 수를 집계한다", () => {
    const snapshot = createSnapshot([
      createEvent(1, "debug"),
      createEvent(2, "info"),
      createEvent(3, "warn"),
      createEvent(4, "error"),
      createEvent(5, "warn"),
    ]);

    expect(createChatRealtimeDiagnosticsSummary(snapshot)).toEqual({
      debugCount: 1,
      errorCount: 1,
      infoCount: 1,
      totalCount: 5,
      warnCount: 2,
    });
  });

  it("최근 이벤트만 최신순으로 반환하고 원본 순서를 유지한다", () => {
    const events = [createEvent(1, "debug"), createEvent(2, "info"), createEvent(3, "warn")];
    const snapshot = createSnapshot(events);

    expect(
      getVisibleChatRealtimeDiagnosticEvents(snapshot, 2).map((event) => event.sequence),
    ).toEqual([3, 2]);
    expect(snapshot.events.map((event) => event.sequence)).toEqual([1, 2, 3]);
  });

  it("잘못된 표시 제한을 거절한다", () => {
    expect(() => getVisibleChatRealtimeDiagnosticEvents(createSnapshot([]), 0)).toThrow(RangeError);
  });

  it("이벤트 종류별 핵심 필드만 안전한 프리뷰로 만든다", () => {
    expect(
      createChatRealtimeDiagnosticEventPreview({
        ...createEvent(1, "warn"),
        event: "websocket.closed",
        connectionAttemptId: "connection-attempt-123456789",
        closeCode: 1006,
        closeReason: "",
        wasClean: false,
        statusBefore: "connected",
        reconnectDecision: "reconnecting",
      }),
    ).toBe("code=1006 · clean=false · decision=reconnecting");

    expect(
      createChatRealtimeDiagnosticEventPreview({
        ...createEvent(2, "warn"),
        event: "room.sync.rejected",
        requestId: "request-01",
        roomId: "room-01",
        generation: 3,
        code: "ROOM_SUBSCRIPTIONS_NOT_READY",
        retryable: false,
      }),
    ).toBe("room=room-01 · generation=3 · code=ROOM_SUBSCRIPTIONS_NOT_READY · retryable=false");
  });
});

function createSnapshot(
  events: readonly ChatRealtimeDiagnosticEvent[],
): ChatRealtimeDiagnosticSnapshot {
  return {
    schemaVersion: 1,
    capturedAt: "2026-08-05T08:00:00.000Z",
    capacity: 500,
    droppedEventCount: 0,
    rejectedEventCount: 0,
    events,
  };
}

function createEvent(
  sequence: number,
  level: ChatRealtimeDiagnosticEvent["level"],
): ChatRealtimeDiagnosticEvent {
  return {
    eventVersion: 1,
    sequence,
    occurredAt: `2026-08-05T08:00:${String(sequence).padStart(2, "0")}.000Z`,
    elapsedMs: sequence,
    runtimeInstanceId: "runtime-test",
    level,
    event: "runtime.started",
    transportKind: "shared-worker",
  };
}
