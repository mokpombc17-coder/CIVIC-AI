import { describe, expect, it } from "vitest";
import { isChatSharedWorkerCommand, isChatSharedWorkerEvent } from "./chat-shared-worker-protocol";

describe("chat shared worker protocol", () => {
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
      }),
    ).toBe(false);
    expect(
      isChatSharedWorkerEvent({
        type: "ROOM_ACTIVATION_FAILED",
        requestId: "request-1",
        roomId: "invalid room",
        code: "INVALID_ROOM_ID",
        message: "invalid",
      }),
    ).toBe(true);
  });
});
