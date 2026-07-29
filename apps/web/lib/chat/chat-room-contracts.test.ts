import { describe, expect, it } from "vitest";
import {
  createRoomRequestSchema,
  publicRoomListResponseSchema,
  roomDetailsSchema,
  roomIdSchema,
} from "./chat-room-contracts";

describe("chat room REST contracts", () => {
  it("방 생성 요청의 이름을 정규화한다", () => {
    expect(
      createRoomRequestSchema.parse({
        name: "  시민 AI 토론방  ",
        visibility: "LISTED",
        joinPolicy: "OPEN",
      }),
    ).toEqual({
      name: "시민 AI 토론방",
      visibility: "LISTED",
      joinPolicy: "OPEN",
    });
  });

  it("roomId와 방 생성 요청의 enum 계약을 검증한다", () => {
    expect(roomIdSchema.safeParse("room_01-test").success).toBe(true);
    expect(roomIdSchema.safeParse("invalid room").success).toBe(false);
    expect(
      createRoomRequestSchema.safeParse({
        name: "테스트방",
        visibility: "PUBLIC",
        joinPolicy: "OPEN",
      }).success,
    ).toBe(false);
  });

  it("방 상세 응답의 nullable 멤버십을 허용한다", () => {
    const result = roomDetailsSchema.parse({
      roomId: "room-01",
      name: "시민 AI 토론방",
      ownerUserId: "local-user-1",
      status: "ACTIVE",
      visibility: "LISTED",
      joinPolicy: "OPEN",
      activeMemberCount: 2,
      createdAt: "2026-07-29T04:30:00Z",
      closedAt: null,
      version: 2,
      participationStatus: "NOT_JOINED",
      myMembership: null,
    });

    expect(result.myMembership).toBeNull();
  });

  it("다음 페이지가 있으면 opaque nextCursor를 요구한다", () => {
    const result = publicRoomListResponseSchema.safeParse({
      items: [],
      nextCursor: null,
      hasNext: true,
    });

    expect(result.success).toBe(false);
  });
});
