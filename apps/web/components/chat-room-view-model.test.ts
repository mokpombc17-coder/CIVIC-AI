import { describe, expect, it } from "vitest";
import {
  createChatMessageItemViewModels,
  createChatMessageViewportItemViewModels,
  createChatRoomHeaderViewModel,
} from "./chat-room-view-model";
import type {
  ChatMessageTimelineItem,
  ChatMessageTimelineRow,
} from "@/lib/chat/chat-message-timeline";

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

  it("membershipId로 작성자를 판정하고 Backend 프로필 이름 또는 알 수 없음을 표시한다", () => {
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
          countable: true,
          senderMembershipId: "membership-02",
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

    const items = createChatMessageItemViewModels(
      timeline,
      "membership-01",
      new Map(),
      new Map(),
      new Map([
        ["membership-01", "참여자 1"],
        ["membership-02", "참여자 2"],
      ]),
      "membership-01",
    );
    const [unknownParticipant] = createChatMessageItemViewModels([timeline[0]!], "membership-01");

    expect(items[0]).toMatchObject({
      canOpenActions: true,
      canMutate: false,
      clientMessageId: "550e8400-e29b-41d4-a716-446655440001",
      deliveryLabel: null,
      deliveryTone: null,
      isMine: false,
      messageId: "message-01",
      unreadCount: null,
      unreadReceiptLabel: null,
      renderKey: "client-message-550e8400-e29b-41d4-a716-446655440001",
      roomSequence: 1,
      senderIsOwner: false,
      senderLabel: "참여자 2",
    });
    expect(items[1]).toMatchObject({
      canOpenActions: false,
      canMutate: false,
      clientMessageId: "550e8400-e29b-41d4-a716-446655440002",
      deliveryLabel: "전송 대기 중",
      deliveryStatus: "queued",
      deliveryTone: "pending",
      isMine: true,
      messageId: null,
      unreadCount: null,
      unreadReceiptLabel: null,
      renderKey: "client-message-550e8400-e29b-41d4-a716-446655440002",
      roomSequence: null,
      senderIsOwner: true,
      senderLabel: "참여자 1",
    });
    expect(unknownParticipant?.senderLabel).toBe("알 수 없음");
  });

  it("같은 참여자의 같은 분 연속 메시지만 하나의 sender group으로 묶는다", () => {
    const confirmed = (
      membershipId: string,
      createdAt: string,
      sequence: number,
    ): ChatMessageTimelineItem => ({
      kind: "confirmed",
      message: {
        clientMessageId: `550e8400-e29b-41d4-a716-${String(sequence).padStart(12, "0")}`,
        content: `메시지 ${sequence}`,
        countable: true,
        createdAt,
        deletedAt: null,
        messageId: `message-${sequence}`,
        messageVersion: 1,
        roomId: "room-01",
        roomSequence: sequence,
        senderMembershipId: membershipId,
        state: "ACTIVE",
        updatedAt: createdAt,
      },
    });
    const rows: readonly ChatMessageTimelineRow[] = [
      {
        date: { day: 27, key: "2026-08-27", month: 8, year: 2026 },
        kind: "date-separator",
        renderKey: "date-separator-2026-08-27",
      },
      { item: confirmed("membership-01", "2026-08-27T07:08:05Z", 1), kind: "message" },
      { item: confirmed("membership-01", "2026-08-27T07:08:45Z", 2), kind: "message" },
      { item: confirmed("membership-02", "2026-08-27T07:08:50Z", 3), kind: "message" },
      { item: confirmed("membership-01", "2026-08-27T07:08:55Z", 4), kind: "message" },
      { item: confirmed("membership-01", "2026-08-27T07:09:01Z", 5), kind: "message" },
      { afterSequence: 5, kind: "read-boundary", renderKey: "read-boundary-5" },
      { item: confirmed("membership-01", "2026-08-27T07:09:20Z", 6), kind: "message" },
      {
        item: {
          kind: "outgoing",
          message: {
            attempt: 0,
            clientMessageId: "550e8400-e29b-41d4-a716-000000000007",
            content: "전송 대기 메시지",
            enqueuedAt: Date.parse("2026-08-27T07:09:30Z"),
            generation: 1,
            message: null,
            retryAt: null,
            roomId: "room-01",
            status: "queued",
          },
        },
        kind: "message",
      },
    ];
    const groups = createChatMessageViewportItemViewModels(
      rows,
      "membership-01",
      new Map(),
      new Map(),
      new Map([
        ["membership-01", "같은 이름"],
        ["membership-02", "같은 이름"],
      ]),
    ).flatMap((item) =>
      item.kind === "message"
        ? [{ ends: item.item.endsSenderGroup, starts: item.item.startsSenderGroup }]
        : [],
    );

    expect(groups).toEqual([
      { ends: false, starts: true },
      { ends: true, starts: false },
      { ends: true, starts: true },
      { ends: true, starts: true },
      { ends: true, starts: true },
      { ends: false, starts: true },
      { ends: true, starts: false },
    ]);
  });

  it("날짜 구분선과 메시지 행을 viewport 전용 모델로 순서대로 변환한다", () => {
    const message: ChatMessageTimelineItem = {
      kind: "confirmed",
      message: {
        clientMessageId: "550e8400-e29b-41d4-a716-446655440020",
        content: "날짜가 있는 메시지",
        countable: true,
        createdAt: "2026-08-06T15:00:00Z",
        deletedAt: null,
        messageId: "message-20",
        messageVersion: 1,
        roomId: "room-01",
        roomSequence: 20,
        senderMembershipId: "membership-02",
        state: "ACTIVE",
        updatedAt: "2026-08-06T15:00:00Z",
      },
    };
    const rows: readonly ChatMessageTimelineRow[] = [
      {
        date: { day: 7, key: "2026-08-07", month: 8, year: 2026 },
        kind: "date-separator",
        renderKey: "date-separator-2026-08-07",
      },
      {
        afterSequence: 19,
        kind: "read-boundary",
        renderKey: "read-boundary-19",
      },
      {
        item: message,
        kind: "message",
      },
    ];

    expect(createChatMessageViewportItemViewModels(rows, "membership-01")).toMatchObject([
      {
        date: { key: "2026-08-07" },
        kind: "date-separator",
        renderKey: "date-separator-2026-08-07",
      },
      {
        afterSequence: 19,
        kind: "read-boundary",
        renderKey: "read-boundary-19",
      },
      {
        item: {
          content: "날짜가 있는 메시지",
          messageId: "message-20",
          roomSequence: 20,
        },
        kind: "message",
        renderKey: "client-message-550e8400-e29b-41d4-a716-446655440020",
      },
    ]);
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
      "membership-01",
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
            countable: true,
            senderMembershipId: "membership-01",
            state: "ACTIVE",
            updatedAt: "2026-07-31T00:00:00Z",
          },
        },
      ],
      "membership-01",
    );

    expect(outgoing?.renderKey).toBe(confirmed?.renderKey);
  });

  it("서버가 전송 명령을 수락한 뒤에는 별도의 확인 문구를 표시하지 않는다", () => {
    const [accepted] = createChatMessageItemViewModels(
      [
        {
          kind: "outgoing",
          message: {
            attempt: 1,
            clientMessageId: "550e8400-e29b-41d4-a716-446655440014",
            content: "수락된 메시지",
            enqueuedAt: 0,
            generation: 1,
            message: null,
            retryAt: null,
            roomId: "room-01",
            status: "accepted",
          },
        },
      ],
      "membership-01",
    );

    expect(accepted).toMatchObject({
      deliveryLabel: null,
      deliveryStatus: "accepted",
      deliveryTone: "pending",
    });
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
            countable: true,
            senderMembershipId: "membership-01",
            state: "DELETED_BY_AUTHOR",
            updatedAt: "2026-07-31T00:01:00Z",
          },
        },
      ],
      "membership-01",
    );

    expect(deleted).toMatchObject({
      canOpenActions: false,
      canMutate: false,
      content: "삭제된 메시지입니다.",
      isDeleted: true,
      isMine: true,
      unreadCount: null,
      unreadReceiptLabel: null,
      renderKey: "client-message-550e8400-e29b-41d4-a716-446655440005",
    });
  });

  it("내가 보낸 ACTIVE 메시지의 양수인 unreadCount만 보조 문구로 변환한다", () => {
    const timeline: readonly ChatMessageTimelineItem[] = [
      {
        kind: "confirmed",
        message: {
          clientMessageId: "550e8400-e29b-41d4-a716-446655440030",
          content: "한 명이 아직 읽지 않은 메시지",
          countable: true,
          createdAt: "2026-08-10T03:00:00Z",
          deletedAt: null,
          messageId: "message-30",
          messageVersion: 1,
          roomId: "room-01",
          roomSequence: 30,
          senderMembershipId: "membership-01",
          state: "ACTIVE",
          updatedAt: "2026-08-10T03:00:00Z",
        },
      },
      {
        kind: "confirmed",
        message: {
          clientMessageId: "550e8400-e29b-41d4-a716-446655440031",
          content: "아직 읽지 않은 메시지",
          countable: true,
          createdAt: "2026-08-10T03:01:00Z",
          deletedAt: null,
          messageId: "message-31",
          messageVersion: 1,
          roomId: "room-01",
          roomSequence: 31,
          senderMembershipId: "membership-02",
          state: "ACTIVE",
          updatedAt: "2026-08-10T03:01:00Z",
        },
      },
      {
        kind: "confirmed",
        message: {
          clientMessageId: "550e8400-e29b-41d4-a716-446655440032",
          content: "모두 읽은 내 메시지",
          countable: true,
          createdAt: "2026-08-10T03:02:00Z",
          deletedAt: null,
          messageId: "message-32",
          messageVersion: 1,
          roomId: "room-01",
          roomSequence: 32,
          senderMembershipId: "membership-01",
          state: "ACTIVE",
          updatedAt: "2026-08-10T03:02:00Z",
        },
      },
    ];
    const summaries = new Map([
      [
        "message-30",
        {
          eligibleRecipientCount: 2,
          readCount: 1,
          unreadCount: 1,
          allRead: false,
        },
      ],
      [
        "message-31",
        {
          eligibleRecipientCount: 1,
          readCount: 0,
          unreadCount: 1,
          allRead: false,
        },
      ],
      [
        "message-32",
        {
          eligibleRecipientCount: 2,
          readCount: 2,
          unreadCount: 0,
          allRead: true,
        },
      ],
    ]);

    const items = createChatMessageItemViewModels(timeline, "membership-01", new Map(), summaries);

    expect(items[0]).toMatchObject({
      isMine: true,
      unreadCount: 1,
      unreadReceiptLabel: "1명 안 읽음",
    });
    expect(items[1]).toMatchObject({
      isMine: false,
      unreadCount: null,
      unreadReceiptLabel: null,
    });
    expect(items[2]).toMatchObject({
      isMine: true,
      unreadCount: null,
      unreadReceiptLabel: null,
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
            countable: true,
            senderMembershipId: "membership-01",
            state: "ACTIVE",
            updatedAt: "2026-07-31T00:01:00Z",
          },
        },
      ],
      "membership-01",
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
      canOpenActions: true,
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

    expect(createChatMessageItemViewModels(timeline, "membership-01")[0]).toMatchObject({
      deliveryLabel: "메시지 전송 제한을 초과했습니다.",
      deliveryStatus: "failed",
      deliveryTone: "error",
    });
  });
});
