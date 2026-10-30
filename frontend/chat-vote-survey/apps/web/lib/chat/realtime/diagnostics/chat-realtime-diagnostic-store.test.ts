import { describe, expect, it } from "vitest";
import { ChatRealtimeDiagnosticStore } from "./chat-realtime-diagnostic-store";

function createStore({ capacity = 3, enabled = true } = {}) {
  let wallClock = 0;
  let monotonicClock = 0;

  return new ChatRealtimeDiagnosticStore({
    runtimeInstanceId: "runtime-1",
    capacity,
    enabled,
    now: () => new Date(Date.UTC(2026, 7, 5, 0, 0, wallClock++)),
    monotonicNow: () => monotonicClock++,
  });
}

describe("ChatRealtimeDiagnosticStore", () => {
  it("이벤트에 순서와 시각 및 런타임 식별자를 추가한다", () => {
    const store = createStore();

    store.emit({
      event: "runtime.started",
      transportKind: "shared-worker",
    });
    store.emit({
      event: "connection.requested",
      connectionAttemptId: "attempt-1",
      trigger: "initial-attach",
      statusBefore: "idle",
    });

    const snapshot = store.getSnapshot();

    expect(snapshot.events).toMatchObject([
      {
        event: "runtime.started",
        sequence: 1,
        elapsedMs: 0,
        runtimeInstanceId: "runtime-1",
        level: "info",
      },
      {
        event: "connection.requested",
        sequence: 2,
        elapsedMs: 1,
        runtimeInstanceId: "runtime-1",
        level: "info",
      },
    ]);
    expect(snapshot.events[0]?.occurredAt).toBe("2026-08-05T00:00:00.000Z");
    expect(snapshot.events[1]?.occurredAt).toBe("2026-08-05T00:00:01.000Z");
  });

  it("capacity를 넘으면 가장 오래된 이벤트부터 제거한다", () => {
    const store = createStore({ capacity: 2 });

    for (const transportKind of ["shared-worker", "leader-tab", "direct"] as const) {
      store.emit({
        event: "runtime.started",
        transportKind,
      });
    }

    const snapshot = store.getSnapshot();

    expect(snapshot.events.map((event) => event.sequence)).toEqual([2, 3]);
    expect(snapshot.droppedEventCount).toBe(1);
  });

  it("clear 이후에도 런타임 내 sequence는 단조 증가한다", () => {
    const store = createStore();

    store.emit({ event: "runtime.started", transportKind: "shared-worker" });
    store.clear();
    store.emit({ event: "runtime.started", transportKind: "shared-worker" });

    const snapshot = store.getSnapshot();

    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0]?.sequence).toBe(2);
    expect(snapshot.droppedEventCount).toBe(0);
    expect(snapshot.rejectedEventCount).toBe(0);
  });

  it("schema를 벗어난 런타임 값을 거절하고 채팅 흐름에 예외를 전파하지 않는다", () => {
    const store = createStore();

    store.emit({
      event: "websocket.closed",
      connectionAttemptId: null,
      closeCode: 1006,
      closeReason: "x".repeat(257),
      wasClean: false,
      statusBefore: "connected",
      reconnectDecision: "reconnecting",
    });

    const snapshot = store.getSnapshot();

    expect(snapshot.events).toEqual([]);
    expect(snapshot.rejectedEventCount).toBe(1);
  });

  it("비활성화 상태에서는 이벤트를 저장하지 않는다", () => {
    const store = createStore({ enabled: false });

    store.emit({ event: "runtime.started", transportKind: "direct" });

    expect(store.getSnapshot().events).toEqual([]);
  });

  it("잘못된 설정을 거절한다", () => {
    expect(
      () =>
        new ChatRealtimeDiagnosticStore({
          runtimeInstanceId: "",
        }),
    ).toThrow("runtimeInstanceId");
    expect(
      () =>
        new ChatRealtimeDiagnosticStore({
          runtimeInstanceId: "runtime-1",
          capacity: 0,
        }),
    ).toThrow("capacity");
  });
});
