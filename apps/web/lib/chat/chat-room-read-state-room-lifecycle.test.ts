import { describe, expect, it, vi } from "vitest";
import { ChatApiError } from "./chat-fetch";
import type { ChatRoomReadStateEntrySnapshot } from "./chat-room-read-state-coordinator";
import { applyChatRoomReadStateRoomLifecycle } from "./chat-room-read-state-room-lifecycle";

describe("applyChatRoomReadStateRoomLifecycle", () => {
  it("Room terminal 상태가 확인되면 다른 처리보다 cancel을 우선한다", () => {
    const coordinator = createCoordinator(createSnapshot("pending"));

    applyChatRoomReadStateRoomLifecycle({
      coordinator,
      isSynchronizationReady: true,
      roomId: "room-a",
      terminalReason: "BANNED",
    });

    expect(coordinator.cancelRoom).toHaveBeenCalledWith("room-a", "BANNED");
    expect(coordinator.retryPending).not.toHaveBeenCalled();
  });

  it("새 Room synchronization에서 retryable pending을 다시 전송한다", () => {
    const coordinator = createCoordinator(createSnapshot("pending"));

    applyChatRoomReadStateRoomLifecycle({
      coordinator,
      isSynchronizationReady: true,
      roomId: "room-a",
      terminalReason: null,
    });

    expect(coordinator.retryPending).toHaveBeenCalledWith("room-a");
  });

  it("ACCESS_DENIED와 READ_SEQUENCE_AHEAD만 새 synchronization에서 resume한다", () => {
    for (const code of ["ACCESS_DENIED", "READ_SEQUENCE_AHEAD"]) {
      const coordinator = createCoordinator(createSnapshot("blocked", createApiError(code)));

      applyChatRoomReadStateRoomLifecycle({
        coordinator,
        isSynchronizationReady: true,
        roomId: "room-a",
        terminalReason: null,
      });

      expect(coordinator.resumeRoom).toHaveBeenCalledWith("room-a");
    }
  });

  it("READ_STATE_INCONSISTENT는 lifecycle synchronization으로 해제하지 않는다", () => {
    const coordinator = createCoordinator(
      createSnapshot("blocked", createApiError("READ_STATE_INCONSISTENT")),
    );

    applyChatRoomReadStateRoomLifecycle({
      coordinator,
      isSynchronizationReady: true,
      roomId: "room-a",
      terminalReason: null,
    });

    expect(coordinator.resumeRoom).not.toHaveBeenCalled();
    expect(coordinator.retryPending).not.toHaveBeenCalled();
  });
});

function createCoordinator(snapshot: ChatRoomReadStateEntrySnapshot) {
  return {
    cancelRoom: vi.fn(),
    getRoomSnapshot: vi.fn(() => snapshot),
    resumeRoom: vi.fn(),
    retryPending: vi.fn(),
  };
}

function createSnapshot(
  status: ChatRoomReadStateEntrySnapshot["status"],
  lastError: unknown = null,
): ChatRoomReadStateEntrySnapshot {
  return {
    confirmedSequence: 0,
    inFlightSequence: null,
    lastError,
    pendingSequence: status === "pending" || status === "blocked" ? 13 : null,
    retryAttempt: 0,
    status,
  };
}

function createApiError(code: string): ChatApiError {
  return new ChatApiError(409, "Conflict", "http://localhost/api/v1/rooms/room-a/read-state", {
    type: `urn:hamcheeze:problem:${code.toLowerCase()}`,
    title: "Room read-state rejected",
    status: 409,
    detail: code,
    instance: "/api/v1/rooms/room-a/read-state",
    code,
    replayed: false,
    retryable: false,
  });
}
