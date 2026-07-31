import { describe, expect, it } from "vitest";
import {
  createChatMessageItemViewModels,
  createChatRoomHeaderViewModel,
} from "./chat-room-view-model";
import type { ChatMessageTimelineItem } from "@/lib/chat/chat-message-timeline";

describe("chat room view model", () => {
  it("방의 서버 상태를 퍼블리싱용 header 문자열로 변환한다", () => {
    expect(
      createChatRoomHeaderViewModel({
        memberCount: 3,
        name: "테스트 채팅방",
        participationStatus: "ACTIVE",
        roomId: "room-01",
        roomStatus: "ACTIVE",
        status: "success",
      }),
    ).toEqual({
      description: "참여자 3명 · 방 상태 ACTIVE · 내 상태 ACTIVE",
      statusLabel: "REST 연동",
      title: "테스트 채팅방",
    });
  });

  it("확정 메시지와 optimistic 메시지를 UI 전용 상태로 변환한다", () => {
    const timeline: readonly ChatMessageTimelineItem[] = [
      {
        kind: "confirmed",
        message: {
          clientMessageId: "550e8400-e29b-41d4-a716-446655440001",
          content: "확정 메시지",
          createdAt: "2026-07-31T00:00:00Z",
          deletedAt: null,
          messageId: "message-01",
          messageVersion: 1,
          roomId: "room-01",
          roomSequence: 1,
          senderUserId: "local-user-2",
          state: "ACTIVE",
          updatedAt: "2026-07-31T00:00:00Z",
        },
      },
      {
        kind: "outgoing",
        message: {
          attempt: 0,
          clientMessageId: "550e8400-e29b-41d4-a716-446655440002",
          content: "대기 메시지",
          enqueuedAt: Date.parse("2026-07-31T00:01:00Z"),
          generation: 1,
          message: null,
          retryAt: null,
          roomId: "room-01",
          status: "queued",
        },
      },
    ];

    const items = createChatMessageItemViewModels(timeline, "local-user-1");

    expect(items[0]).toMatchObject({
      canMutate: false,
      clientMessageId: "550e8400-e29b-41d4-a716-446655440001",
      deliveryLabel: null,
      deliveryTone: null,
      isMine: false,
      messageId: "message-01",
      renderKey: "client-message-550e8400-e29b-41d4-a716-446655440001",
      senderLabel: "local-user-2",
    });
    expect(items[1]).toMatchObject({
      canMutate: false,
      clientMessageId: "550e8400-e29b-41d4-a716-446655440002",
      deliveryLabel: "전송 대기 중",
      deliveryStatus: "queued",
      deliveryTone: "pending",
      isMine: true,
      messageId: null,
      renderKey: "client-message-550e8400-e29b-41d4-a716-446655440002",
    });
  });

  it("optimistic 메시지와 확정 메시지에 동일한 render key를 부여한다", () => {
    const clientMessageId = "550e8400-e29b-41d4-a716-446655440004";
    const [outgoing] = createChatMessageItemViewModels(
      [
        {
          kind: "outgoing",
          message: {
            attempt: 0,
            clientMessageId,
            content: "동일 메시지",
            enqueuedAt: 0,
            generation: 1,
            message: null,
            retryAt: null,
            roomId: "room-01",
            status: "sending",
          },
        },
      ],
      "local-user-1",
    );
    const [confirmed] = createChatMessageItemViewModels(
      [
        {
          kind: "confirmed",
          message: {
            clientMessageId,
            content: "동일 메시지",
            createdAt: "2026-07-31T00:00:00Z",
            deletedAt: null,
            messageId: "message-04",
            messageVersion: 1,
            roomId: "room-01",
            roomSequence: 4,
            senderUserId: "local-user-1",
            state: "ACTIVE",
            updatedAt: "2026-07-31T00:00:00Z",
          },
        },
      ],
      "local-user-1",
    );

    expect(outgoing?.renderKey).toBe(confirmed?.renderKey);
  });

  it("작성자 삭제 메시지를 기존 위치의 tombstone 문구로 변환한다", () => {
    const [deleted] = createChatMessageItemViewModels(
      [
        {
          kind: "confirmed",
          message: {
            clientMessageId: "550e8400-e29b-41d4-a716-446655440005",
            content: null,
            createdAt: "2026-07-31T00:00:00Z",
            deletedAt: "2026-07-31T00:01:00Z",
            messageId: "message-05",
            messageVersion: 2,
            roomId: "room-01",
            roomSequence: 5,
            senderUserId: "local-user-1",
            state: "DELETED_BY_AUTHOR",
            updatedAt: "2026-07-31T00:01:00Z",
          },
        },
      ],
      "local-user-1",
    );

    expect(deleted).toMatchObject({
      canMutate: false,
      content: "삭제된 메시지입니다.",
      isDeleted: true,
      isMine: true,
      renderKey: "client-message-550e8400-e29b-41d4-a716-446655440005",
    });
  });

  it("작성자의 ACTIVE 확정 메시지만 수정·삭제 가능한 상태로 변환한다", () => {
    const [message] = createChatMessageItemViewModels(
      [
        {
          kind: "confirmed",
          message: {
            clientMessageId: "550e8400-e29b-41d4-a716-446655440006",
            content: "수정된 메시지",
            createdAt: "2026-07-31T00:00:00Z",
            deletedAt: null,
            messageId: "message-06",
            messageVersion: 2,
            roomId: "room-01",
            roomSequence: 6,
            senderUserId: "local-user-1",
            state: "ACTIVE",
            updatedAt: "2026-07-31T00:01:00Z",
          },
        },
      ],
      "local-user-1",
      new Map([
        [
          "message-06",
          {
            clientMutationId: "550e8400-e29b-41d4-a716-446655440016",
            commandType: "EDIT_MESSAGE",
            error: null,
            status: "sending",
          },
        ],
      ]),
    );

    expect(message).toMatchObject({
      canMutate: true,
      isDeleted: false,
      isEdited: true,
      messageId: "message-06",
      mutation: {
        clientMutationId: "550e8400-e29b-41d4-a716-446655440016",
        status: "sending",
      },
    });
  });

  it("최종 실패의 원인을 message bubble용 오류 상태로 변환한다", () => {
    const timeline: readonly ChatMessageTimelineItem[] = [
      {
        kind: "outgoing",
        message: {
          attempt: 3,
          clientMessageId: "550e8400-e29b-41d4-a716-446655440003",
          content: "실패 메시지",
          enqueuedAt: 0,
          generation: 1,
          message: "메시지 전송 제한을 초과했습니다.",
          retryAt: null,
          roomId: "room-01",
          status: "failed",
        },
      },
    ];

    expect(createChatMessageItemViewModels(timeline, "local-user-1")[0]).toMatchObject({
      deliveryLabel: "메시지 전송 제한을 초과했습니다.",
      deliveryStatus: "failed",
      deliveryTone: "error",
    });
  });
});
