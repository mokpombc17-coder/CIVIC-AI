import { describe, expect, it, vi } from "vitest";
import { ChatApiError } from "./chat-fetch";
import type { RoomCreationRequestResponse } from "./chat-room-contracts";
import {
  executeRoomCreationRequestCancellation,
  isRoomCreationDecisionConflict,
} from "./room-creation-request-cancellation";

describe("room creation request cancellation", () => {
  it("취소 성공 결과를 그대로 반환하고 상세를 재조회하지 않는다", async () => {
    const cancel = vi.fn(async () => CANCELED_REQUEST);
    const refresh = vi.fn(async () => APPROVED_REQUEST);

    await expect(
      executeRoomCreationRequestCancellation({
        cancel,
        creationRequestId: "creation-request-01",
        refresh,
      }),
    ).resolves.toEqual({ kind: "canceled", request: CANCELED_REQUEST });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("결정 경합이면 취소를 반복하지 않고 최신 상세를 재조회한다", async () => {
    const conflict = createDecisionConflictError();
    const cancel = vi.fn(async () => Promise.reject(conflict));
    const refresh = vi.fn(async () => APPROVED_REQUEST);

    await expect(
      executeRoomCreationRequestCancellation({
        cancel,
        creationRequestId: "creation-request-01",
        refresh,
      }),
    ).resolves.toEqual({ kind: "conflict-refreshed", request: APPROVED_REQUEST });
    expect(cancel).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    expect(isRoomCreationDecisionConflict(conflict)).toBe(true);
  });

  it("경합 후 재조회도 실패하면 재조회 오류를 전달한다", async () => {
    const refreshError = new Error("refresh failed");

    await expect(
      executeRoomCreationRequestCancellation({
        cancel: async () => Promise.reject(createDecisionConflictError()),
        creationRequestId: "creation-request-01",
        refresh: async () => Promise.reject(refreshError),
      }),
    ).resolves.toEqual({ error: refreshError, kind: "failed" });
  });

  it("일반 실패는 상세 재조회 없이 전달한다", async () => {
    const error = new Error("network");
    const refresh = vi.fn(async () => APPROVED_REQUEST);

    await expect(
      executeRoomCreationRequestCancellation({
        cancel: async () => Promise.reject(error),
        creationRequestId: "creation-request-01",
        refresh,
      }),
    ).resolves.toEqual({ error, kind: "failed" });
    expect(refresh).not.toHaveBeenCalled();
  });
});

function createDecisionConflictError(): ChatApiError {
  return new ChatApiError(409, "Conflict", "http://localhost/requests/request-01/cancel", {
    type: "urn:hamcheeze:problem:room-creation-decision-conflict",
    title: "Room creation decision conflict",
    status: 409,
    detail: "A decision was already made.",
    instance: "/api/v1/me/room-creation-requests/creation-request-01/cancel",
    code: "ROOM_CREATION_DECISION_CONFLICT",
    replayed: false,
    retryable: false,
  });
}

const RESPONSE_BASE = {
  clientRequestId: "b3688817-a610-4ef2-987a-1172945974c7",
  replayed: false,
  creationRequestId: "creation-request-01",
  requestedAt: "2026-08-25T07:00:00Z",
  resolvedAt: "2026-08-25T08:00:00Z",
  rejectionReason: null,
} as const;

const CANCELED_REQUEST = {
  ...RESPONSE_BASE,
  code: "ROOM_CREATION_CANCELED",
  status: "CANCELED",
  roomId: null,
  ownerMembershipId: null,
  roomVersion: null,
  ownerMembershipVersion: null,
} satisfies RoomCreationRequestResponse;

const APPROVED_REQUEST = {
  ...RESPONSE_BASE,
  code: "ROOM_CREATED",
  status: "APPROVED",
  roomId: "room-01",
  ownerMembershipId: "membership-01",
  roomVersion: 1,
  ownerMembershipVersion: 1,
} satisfies RoomCreationRequestResponse;
