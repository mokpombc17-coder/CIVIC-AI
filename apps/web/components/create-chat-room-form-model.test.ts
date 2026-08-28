import { describe, expect, it } from "vitest";
import {
  parseCreateChatRoomFormData,
  resolveCreateChatRoomResultDestination,
} from "@/components/create-chat-room-form-model";
import type { CreateRoomResponse } from "@/lib/chat/chat-room-contracts";

describe("create chat room form model", () => {
  it("선택한 category를 단일 원소 배열로 canonical payload에 포함한다", () => {
    const result = parseCreateChatRoomFormData(
      createFormData({
        category: "ENVIRONMENT",
        description: " 환경 정책을 논의합니다. ",
      }),
    );

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data).toEqual({
        name: "시민 AI 토론방",
        description: "환경 정책을 논의합니다.",
        categories: ["ENVIRONMENT"],
        visibility: "LISTED",
        joinPolicy: "OPEN",
      });
    }
  });

  it("category와 공개·참여 정책을 표시하지 않은 폼에는 임시 기본값을 적용한다", () => {
    const formData = new FormData();
    formData.set("name", "시민 AI 토론방");
    formData.set("description", "정책을 논의합니다.");

    const result = parseCreateChatRoomFormData(formData);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data).toEqual({
        name: "시민 AI 토론방",
        description: "정책을 논의합니다.",
        categories: ["POLICY"],
        visibility: "LISTED",
        joinPolicy: "OPEN",
      });
    }
  });

  it("명시적으로 전달된 알 수 없는 category enum은 거절한다", () => {
    expect(parseCreateChatRoomFormData(createFormData({ category: "UNKNOWN" })).success).toBe(
      false,
    );
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
  requestedAt: "2026-08-25T07:00:00Z",
} as const;

const APPROVED_RESPONSE = {
  ...RESPONSE_BASE,
  code: "ROOM_CREATED",
  status: "APPROVED",
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
    category?: string;
    description?: string;
  }> = {},
): FormData {
  const formData = new FormData();
  formData.set("name", "시민 AI 토론방");
  formData.set("description", patch.description ?? "");
  formData.set("visibility", "LISTED");
  formData.set("joinPolicy", "OPEN");

  if (patch.category !== undefined) {
    formData.set("category", patch.category);
  }

  return formData;
}
