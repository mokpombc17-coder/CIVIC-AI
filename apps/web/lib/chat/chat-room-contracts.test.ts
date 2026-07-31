import { describe, expect, it } from "vitest";
import {
  chatMessageContentSchema,
  chatMessageSchema,
  chatMessageSendContentSchema,
  createRoomRequestSchema,
  createMessageHistoryResponseSchema,
  messageHistoryRequestSchema,
  normalizeChatMessageContent,
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

  it("메시지 이력 조회 방향을 동시에 지정할 수 없게 한다", () => {
    expect(
      messageHistoryRequestSchema.safeParse({
        mode: "before",
        beforeSequence: 71,
        afterSequence: 120,
        limit: 50,
      }).success,
    ).toBe(false);
    expect(
      messageHistoryRequestSchema.safeParse({
        mode: "after",
        afterSequence: 0,
        limit: 50,
      }).success,
    ).toBe(true);
  });

  it("Java String.strip 기준으로 메시지 앞뒤 공백을 제거하고 내부 줄바꿈은 보존한다", () => {
    expect(normalizeChatMessageContent(" \t\u3000안녕하세요.\n반갑습니다.\u3000\r ")).toBe(
      "안녕하세요.\n반갑습니다.",
    );
    expect(normalizeChatMessageContent("\u00A0안녕하세요.\u00A0")).toBe("\u00A0안녕하세요.\u00A0");
    expect(chatMessageSendContentSchema.parse(" \t안녕하세요.\n반갑습니다.\r ")).toBe(
      "안녕하세요.\n반갑습니다.",
    );
  });

  it("strip된 메시지 content에 서버 길이와 제어문자 제약을 적용한다", () => {
    expect(chatMessageContentSchema.safeParse("   ").success).toBe(false);
    expect(chatMessageContentSchema.safeParse(" 앞뒤 공백 ").success).toBe(false);
    expect(chatMessageContentSchema.safeParse("허용되지 않음\u0000").success).toBe(false);
    expect(chatMessageSendContentSchema.safeParse(` ${"😀".repeat(2_000)} `).success).toBe(true);
    expect(chatMessageSendContentSchema.safeParse(` ${"😀".repeat(2_001)} `).success).toBe(false);
    expect(chatMessageSendContentSchema.parse("\u000B안녕하세요.\u000B")).toBe("안녕하세요.");
    expect(chatMessageSendContentSchema.safeParse("안녕\u000B하세요.").success).toBe(false);
  });

  it("조회 방향 cursor와 roomSequence 오름차순을 검증한다", () => {
    const latestSchema = createMessageHistoryResponseSchema(
      {
        mode: "latest",
      },
      "room-01",
    );

    expect(
      latestSchema.safeParse({
        items: [createMessage(119), createMessage(120)],
        nextBeforeSequence: 119,
        nextAfterSequence: null,
        hasMore: true,
      }).success,
    ).toBe(true);
    expect(
      latestSchema.safeParse({
        items: [createMessage(120), createMessage(119)],
        nextBeforeSequence: null,
        nextAfterSequence: 120,
        hasMore: true,
      }).success,
    ).toBe(false);
  });

  it("활성 메시지와 작성자 삭제 tombstone snapshot을 구분해 검증한다", () => {
    const activeMessage = createMessage(1);
    const deletedMessage = {
      ...activeMessage,
      content: null,
      state: "DELETED_BY_AUTHOR",
      messageVersion: 2,
      updatedAt: "2026-07-29T05:00:00Z",
      deletedAt: "2026-07-29T05:00:00Z",
    };

    expect(chatMessageSchema.parse(activeMessage)).toEqual(activeMessage);
    expect(chatMessageSchema.parse(deletedMessage)).toEqual(deletedMessage);
    expect(
      chatMessageSchema.safeParse({
        ...deletedMessage,
        content: "삭제 전 내용",
      }).success,
    ).toBe(false);
    expect(
      chatMessageSchema.safeParse({
        ...deletedMessage,
        deletedAt: "2026-07-29T05:01:00Z",
      }).success,
    ).toBe(false);
  });
});

function createMessage(roomSequence: number) {
  return {
    messageId: `message-${roomSequence}`,
    roomId: "room-01",
    roomSequence,
    senderUserId: "local-user-1",
    clientMessageId: "ed7d2fe8-996d-4660-822f-e84af1218743",
    content: "안녕하세요.",
    createdAt: "2026-07-29T04:40:00Z",
    deletedAt: null,
    messageVersion: 1,
    state: "ACTIVE" as const,
    updatedAt: "2026-07-29T04:40:00Z",
  };
}
