import { describe, expect, it } from "vitest";
import { isChatSharedWorkerCommand, isChatSharedWorkerEvent } from "./chat-shared-worker-protocol";

describe("chat shared worker protocol", () => {
  it("연결 교체 snapshot의 terminal 상태와 오류 code를 검증한다", () => {
    const snapshotEvent = {
      type: "CONNECTION_SNAPSHOT",
      workerInstanceId: "worker-1",
      attachedPortCount: 2,
      snapshot: {
        status: "replaced",
        error: {
          source: "websocket",
          code: "CONNECTION_REPLACED",
          message: "다른 환경에서 연결됨",
        },
      },
    };

    expect(isChatSharedWorkerEvent(snapshotEvent)).toBe(true);
    expect(
      isChatSharedWorkerEvent({
        ...snapshotEvent,
        snapshot: {
          ...snapshotEvent.snapshot,
          error: {
            ...snapshotEvent.snapshot.error,
            code: "UNKNOWN_CLOSE_CODE",
          },
        },
      }),
    ).toBe(false);
  });

  it("방 lease command의 correlation 필드를 검증한다", () => {
    expect(
      isChatSharedWorkerCommand({
        type: "CLAIM_ROOM",
        portId: "port-1",
        requestId: "request-1",
        roomId: "room-01",
      }),
    ).toBe(true);
    expect(
      isChatSharedWorkerCommand({
        type: "RELEASE_ROOM",
        portId: "port-1",
        requestId: "",
        roomId: "room-01",
      }),
    ).toBe(false);
  });

  it("방 lease event의 generation과 오류 payload를 검증한다", () => {
    expect(
      isChatSharedWorkerEvent({
        type: "ROOM_REPLACED",
        roomId: "room-01",
        activatedRoomId: "room-02",
        generation: 2,
      }),
    ).toBe(true);
    expect(
      isChatSharedWorkerEvent({
        type: "ROOM_ACTIVATED",
        requestId: "request-1",
        roomId: "room-01",
        generation: -1,
        watermarkSequence: 120,
      }),
    ).toBe(false);
    expect(
      isChatSharedWorkerEvent({
        type: "ROOM_ACTIVATED",
        requestId: "request-1",
        roomId: "room-01",
        generation: 1,
        watermarkSequence: 120,
      }),
    ).toBe(true);
    expect(
      isChatSharedWorkerEvent({
        type: "ROOM_SYNCING",
        roomId: "room-01",
        generation: 1,
      }),
    ).toBe(true);
    expect(
      isChatSharedWorkerEvent({
        type: "ROOM_SYNC_FAILED",
        requestId: "request-1",
        roomId: "room-01",
        generation: 1,
        code: "ROOM_AUTHORIZATION_UNAVAILABLE",
        retryable: true,
        message: "retry",
      }),
    ).toBe(true);
    expect(
      isChatSharedWorkerEvent({
        type: "ROOM_ACTIVATION_FAILED",
        requestId: "request-1",
        roomId: "invalid room",
        code: "INVALID_ROOM_ID",
        message: "invalid",
      }),
    ).toBe(true);
    expect(
      isChatSharedWorkerEvent({
        type: "ROOM_SUBSCRIPTION_FAILED",
        roomId: "room-01",
        generation: 3,
        code: "ACTIVE_ROOM_LIMIT_EXCEEDED",
        message: "rejected",
      }),
    ).toBe(true);
  });
});
