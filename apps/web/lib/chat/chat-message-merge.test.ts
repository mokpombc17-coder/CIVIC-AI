import { describe, expect, it } from "vitest";
import { ChatMessageMergeConflictError, mergeChatMessages } from "./chat-message-merge";
import type { ChatMessage } from "./chat-room-contracts";

describe("mergeChatMessages", () => {
  it("여러 출처의 메시지를 sequence 순서로 정렬하고 완전히 같은 중복은 제거한다", () => {
    const message1 = createMessage(1);
    const message2 = createMessage(2);
    const message3 = createMessage(3);

    const result = mergeChatMessages({
      roomId: "room-01",
      sources: [
        [message3, message1],
        [message2, { ...message3 }],
      ],
    });

    expect(result.messages.map(({ roomSequence }) => roomSequence)).toEqual([1, 2, 3]);
    expect(result.gaps).toEqual([]);
    expect(result.lastContiguousSequence).toBe(3);
  });

  it("같은 messageId에서 더 높은 messageVersion snapshot을 적용한다", () => {
    const message = createMessage(1);
    const updatedMessage: ChatMessage = {
      ...message,
      content: "변경된 내용",
      messageVersion: 2,
      updatedAt: "2026-07-29T04:41:00Z",
    };

    const result = mergeChatMessages({
      roomId: "room-01",
      sources: [[message], [updatedMessage]],
    });

    expect(result.messages).toEqual([updatedMessage]);
  });

  it("같은 messageId의 오래되거나 중복된 snapshot은 현재 상태를 되돌리지 않는다", () => {
    const message = createMessage(1);
    const updatedMessage: ChatMessage = {
      ...message,
      content: "변경된 내용",
      messageVersion: 2,
      updatedAt: "2026-07-29T04:41:00Z",
    };

    const result = mergeChatMessages({
      roomId: "room-01",
      sources: [[updatedMessage], [message], [{ ...updatedMessage }]],
    });

    expect(result.messages).toEqual([updatedMessage]);
  });

  it("같은 messageVersion의 서로 다른 snapshot은 계약 충돌로 처리한다", () => {
    const message = createMessage(1);

    expect(() =>
      mergeChatMessages({
        roomId: "room-01",
        sources: [[message], [{ ...message, content: "충돌하는 내용" }]],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ChatMessageMergeConflictError>>({
        name: "ChatMessageMergeConflictError",
        code: "MESSAGE_ID_CONFLICT",
      }),
    );
  });

  it("같은 messageId의 불변 식별자가 바뀌면 version이 높아도 계약 충돌로 처리한다", () => {
    const message = createMessage(1);

    expect(() =>
      mergeChatMessages({
        roomId: "room-01",
        sources: [
          [message],
          [
            {
              ...message,
              senderUserId: "another-user",
              senderMembershipId: "another-membership",
              messageVersion: 2,
              updatedAt: "2026-07-29T04:41:00Z",
            },
          ],
        ],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ChatMessageMergeConflictError>>({
        code: "MESSAGE_ID_CONFLICT",
      }),
    );
  });

  it("senderUserId가 달라도 senderMembershipId가 같으면 같은 작성자의 새 snapshot으로 병합한다", () => {
    const message = createMessage(1);
    const updatedMessage = {
      ...message,
      senderUserId: "legacy-user-id-that-must-not-be-used",
      messageVersion: 2,
      updatedAt: "2026-07-29T04:41:00Z",
    };

    expect(
      mergeChatMessages({
        roomId: "room-01",
        sources: [[message], [updatedMessage]],
      }).messages,
    ).toEqual([updatedMessage]);
  });

  it("생성 시 결정된 countable이 이후 snapshot에서 바뀌면 계약 충돌로 처리한다", () => {
    const message = createMessage(1);

    expect(() =>
      mergeChatMessages({
        roomId: "room-01",
        sources: [
          [message],
          [
            {
              ...message,
              countable: false,
              messageVersion: 2,
              updatedAt: "2026-07-29T04:41:00Z",
            },
          ],
        ],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ChatMessageMergeConflictError>>({
        code: "MESSAGE_ID_CONFLICT",
      }),
    );
  });

  it("같은 roomSequence에 다른 messageId가 오면 계약 충돌로 처리한다", () => {
    const message = createMessage(1);

    expect(() =>
      mergeChatMessages({
        roomId: "room-01",
        sources: [
          [message],
          [
            {
              ...message,
              messageId: "another-message",
              clientMessageId: "978e33c5-adad-4f75-918c-124a858ab070",
            },
          ],
        ],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ChatMessageMergeConflictError>>({
        code: "ROOM_SEQUENCE_CONFLICT",
      }),
    );
  });

  it("요청한 방과 다른 메시지는 섞지 않는다", () => {
    const incomingMessage = {
      ...createMessage(1),
      roomId: "room-02",
    };

    expect(() =>
      mergeChatMessages({
        roomId: "room-01",
        sources: [[incomingMessage]],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ChatMessageMergeConflictError>>({
        code: "ROOM_MISMATCH",
        incomingMessage,
      }),
    );
  });

  it("정렬된 메시지 사이의 모든 sequence 누락 범위를 찾는다", () => {
    const result = mergeChatMessages({
      roomId: "room-01",
      sources: [[createMessage(10), createMessage(12), createMessage(15)]],
    });

    expect(result.gaps).toEqual([
      {
        afterSequence: 10,
        beforeSequence: 12,
        missingFromSequence: 11,
        missingToSequence: 11,
      },
      {
        afterSequence: 12,
        beforeSequence: 15,
        missingFromSequence: 13,
        missingToSequence: 14,
      },
    ]);
    expect(result.lastContiguousSequence).toBe(10);
  });

  it("복구 checkpoint 이후 첫 누락을 기준으로 마지막 연속 sequence를 계산한다", () => {
    const withGap = mergeChatMessages({
      roomId: "room-01",
      afterSequence: 120,
      sources: [[createMessage(121), createMessage(123), createMessage(124)]],
    });

    expect(withGap.gaps).toEqual([
      {
        afterSequence: 121,
        beforeSequence: 123,
        missingFromSequence: 122,
        missingToSequence: 122,
      },
    ]);
    expect(withGap.lastContiguousSequence).toBe(121);

    const recovered = mergeChatMessages({
      roomId: "room-01",
      afterSequence: 120,
      sources: [withGap.messages, [createMessage(122)], [createMessage(123)]],
    });

    expect(recovered.gaps).toEqual([]);
    expect(recovered.lastContiguousSequence).toBe(124);
  });

  it("유효하지 않은 복구 checkpoint는 메시지 처리 전에 거절한다", () => {
    expect(() =>
      mergeChatMessages({
        roomId: "room-01",
        afterSequence: -1,
        sources: [[]],
      }),
    ).toThrow(RangeError);
  });
});

function createMessage(roomSequence: number): Extract<ChatMessage, { state: "ACTIVE" }> {
  return {
    messageId: `message-${roomSequence}`,
    roomId: "room-01",
    roomSequence,
    countable: true,
    senderUserId: "local-user-1",
    senderMembershipId: "membership-01",
    clientMessageId: `00000000-0000-4000-8000-${String(roomSequence).padStart(12, "0")}`,
    content: `메시지 ${roomSequence}`,
    createdAt: "2026-07-29T04:40:00Z",
    deletedAt: null,
    messageVersion: 1,
    state: "ACTIVE",
    updatedAt: "2026-07-29T04:40:00Z",
  };
}
