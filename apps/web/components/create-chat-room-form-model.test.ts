import { describe, expect, it } from "vitest";
import {
  parseCreateChatRoomFormData,
  resolveCreateChatRoomResultDestination,
} from "@/components/create-chat-room-form-model";
import type { CreateRoomResponse } from "@/lib/chat/chat-room-contracts";

describe("create chat room form model", () => {
  it("관리자가 부여하는 category를 생성 요청 payload에서 제외한다", () => {
    const result = parseCreateChatRoomFormData(
      createFormData({
        description: " 환경 정책을 논의합니다. ",
      }),
    );

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data).toEqual({
        name: "시민 AI 토론방",
        description: "환경 정책을 논의합니다.",
        visibility: "LISTED",
        joinPolicy: "OPEN",
      });
    }
  });

  it("공개·참여 정책을 표시하지 않은 폼에는 임시 기본값을 적용한다", () => {
    const formData = new FormData();
    formData.set("name", "시민 AI 토론방");
    formData.set("description", "정책을 논의합니다.");

    const result = parseCreateChatRoomFormData(formData);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data).toEqual({
        name: "시민 AI 토론방",
        description: "정책을 논의합니다.",
        visibility: "LISTED",
        joinPolicy: "OPEN",
      });
    }
  });

  it("APPROVED 결과만 생성된 Room 화면으로 연결한다", () => {
    expect(resolveCreateChatRoomResultDestination(APPROVED_RESPONSE)).toEqual({
      href: "/chat/room-123",
      kind: "room",
    });
  });

  it.each(["PENDING", "REJECTED", "CANCELED"] as const)(
    "%s 결과는 생성 신청 결과로 분리한다",
    (status) => {
      expect(resolveCreateChatRoomResultDestination(CREATION_REQUEST_RESPONSES[status])).toEqual({
        kind: "creation-request",
        response: CREATION_REQUEST_RESPONSES[status],
      });
    },
  );
});

const RESPONSE_BASE = {
  clientRequestId: "b3688817-a610-4ef2-987a-1172945974c7",
  replayed: false,
  creationRequestId: "creation/request 123",
  name: "시민 AI 토론방",
  requestedAt: "2026-08-25T07:00:00Z",
} as const;

const APPROVED_RESPONSE = {
  ...RESPONSE_BASE,
  code: "ROOM_CREATED",
  status: "APPROVED",
  roomStatus: "ACTIVE",
  resolvedAt: "2026-08-25T07:00:01Z",
  roomId: "room-123",
  ownerMembershipId: "membership-123",
  roomVersion: 1,
  ownerMembershipVersion: 1,
  rejectionReason: null,
} satisfies CreateRoomResponse;

const CREATION_REQUEST_RESPONSES = {
  PENDING: {
    ...RESPONSE_BASE,
    code: "ROOM_CREATION_REQUESTED",
    status: "PENDING",
    roomStatus: null,
    resolvedAt: null,
    roomId: null,
    ownerMembershipId: null,
    roomVersion: null,
    ownerMembershipVersion: null,
    rejectionReason: null,
  },
  REJECTED: {
    ...RESPONSE_BASE,
    code: "ROOM_CREATION_REJECTED",
    status: "REJECTED",
    roomStatus: null,
    resolvedAt: "2026-08-25T07:00:01Z",
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
    roomStatus: null,
    resolvedAt: "2026-08-25T07:00:01Z",
    roomId: null,
    ownerMembershipId: null,
    roomVersion: null,
    ownerMembershipVersion: null,
    rejectionReason: null,
  },
} as const satisfies Record<"PENDING" | "REJECTED" | "CANCELED", CreateRoomResponse>;

function createFormData(
  patch: Readonly<{
    description?: string;
  }> = {},
): FormData {
  const formData = new FormData();
  formData.set("name", "시민 AI 토론방");
  formData.set("description", patch.description ?? "");
  formData.set("visibility", "LISTED");
  formData.set("joinPolicy", "OPEN");

  return formData;
}
