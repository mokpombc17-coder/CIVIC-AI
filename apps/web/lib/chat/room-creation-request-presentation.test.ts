import { describe, expect, it } from "vitest";
import { ChatApiError } from "./chat-fetch";
import type { RoomCreationRequestResponse } from "./chat-room-contracts";
import {
  createRoomCreationRequestErrorPresentation,
  createRoomCreationRequestListErrorMessage,
  createRoomCreationRequestStatusPresentation,
} from "./room-creation-request-presentation";

describe("room creation request presentation", () => {
  it.each([
    ["PENDING", "승인 대기", "info"],
    ["APPROVED", "생성 완료", "success"],
    ["REJECTED", "반려", "danger"],
    ["CANCELED", "신청 취소", "neutral"],
  ] as const)("%s 상태를 사용자용 표현으로 변환한다", (status, badgeLabel, tone) => {
    expect(createRoomCreationRequestStatusPresentation(CREATION_REQUESTS[status])).toMatchObject({
      badgeLabel,
      tone,
    });
  });

  it("REJECTED 상태에는 서버 반려 사유를 그대로 표시한다", () => {
    expect(
      createRoomCreationRequestStatusPresentation(CREATION_REQUESTS.REJECTED).description,
    ).toBe("운영 정책과 맞지 않습니다.");
  });

  it.each([
    ["ROOM_CREATION_REQUEST_NOT_FOUND", "신청을 찾을 수 없습니다."],
    ["UNAUTHENTICATED", "로그인이 필요합니다."],
    ["ACCESS_DENIED", "신청을 확인할 권한이 없습니다."],
  ] as const)("%s 오류는 재시도 대신 목록 복귀를 안내한다", (code, title) => {
    expect(createRoomCreationRequestErrorPresentation(createApiError(code))).toMatchObject({
      action: "return-to-list",
      title,
    });
  });

  it("일시적인 오류는 수동 재시도를 제공한다", () => {
    expect(createRoomCreationRequestErrorPresentation(new TypeError("network"))).toEqual({
      action: "retry",
      description: "network",
      title: "신청 상태를 불러오지 못했습니다.",
    });
  });

  it("신청 목록의 무효한 cursor는 첫 page 복구 안내로 표시한다", () => {
    expect(createRoomCreationRequestListErrorMessage(createApiError("INVALID_CURSOR"))).toContain(
      "처음부터 다시 불러옵니다",
    );
  });
});

function createApiError(code: string): ChatApiError {
  return new ChatApiError(404, "Not Found", "http://localhost/requests/request-01", {
    type: `urn:hamcheeze:problem:${code.toLowerCase()}`,
    title: "Room creation request failed",
    status: 404,
    detail: "Request failed.",
    instance: "/api/v1/me/room-creation-requests/request-01",
    code,
    replayed: false,
    retryable: false,
  });
}

const RESPONSE_BASE = {
  clientRequestId: "b3688817-a610-4ef2-987a-1172945974c7",
  replayed: false,
  creationRequestId: "creation-request-01",
  requestedAt: "2026-08-25T07:00:00Z",
} as const;

const CREATION_REQUESTS = {
  PENDING: {
    ...RESPONSE_BASE,
    code: "ROOM_CREATION_REQUESTED",
    status: "PENDING",
    resolvedAt: null,
    roomId: null,
    ownerMembershipId: null,
    roomVersion: null,
    ownerMembershipVersion: null,
    rejectionReason: null,
  },
  APPROVED: {
    ...RESPONSE_BASE,
    code: "ROOM_CREATED",
    status: "APPROVED",
    resolvedAt: "2026-08-25T08:00:00Z",
    roomId: "room-01",
    ownerMembershipId: "membership-01",
    roomVersion: 1,
    ownerMembershipVersion: 1,
    rejectionReason: null,
  },
  REJECTED: {
    ...RESPONSE_BASE,
    code: "ROOM_CREATION_REJECTED",
    status: "REJECTED",
    resolvedAt: "2026-08-25T08:00:00Z",
    roomId: null,
    ownerMembershipId: null,
    roomVersion: null,
    ownerMembershipVersion: null,
    rejectionReason: "운영 정책과 맞지 않습니다.",
  },
  CANCELED: {
    ...RESPONSE_BASE,
    code: "ROOM_CREATION_CANCELED",
    status: "CANCELED",
    resolvedAt: "2026-08-25T08:00:00Z",
    roomId: null,
    ownerMembershipId: null,
    roomVersion: null,
    ownerMembershipVersion: null,
    rejectionReason: null,
  },
} as const satisfies Record<
  "PENDING" | "APPROVED" | "REJECTED" | "CANCELED",
  RoomCreationRequestResponse
>;
