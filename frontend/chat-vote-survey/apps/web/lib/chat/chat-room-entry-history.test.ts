import { describe, expect, it } from "vitest";
import type { ChatMessage } from "./chat-room-contracts";
import {
  inspectChatRoomEntryHistory,
  type ChatRoomEntryHistoryPageState,
} from "./chat-room-entry-history";

describe("Room entry history", () => {
  it("불러온 최신 목록에 읽은 위치가 있으면 첫 안 읽은 sequence를 찾는다", () => {
    expect(inspectChatRoomEntryHistory(createHistory([100, 101, 102], true), 100)).toEqual({
      firstUnreadSequence: 101,
      status: "found",
    });
  });

  it("읽은 위치가 불러온 목록보다 이전이면 목록 밖으로 판단한다", () => {
    expect(inspectChatRoomEntryHistory(createHistory([151, 152, 153], true), 100)).toEqual({
      status: "outside",
    });
  });

  it("더 이전 메시지가 없으면 불러온 목록 안에서 이동하도록 판단한다", () => {
    expect(inspectChatRoomEntryHistory(createHistory([101, 102], false), 100)).toEqual({
      status: "exhausted",
    });
    expect(inspectChatRoomEntryHistory(createHistory([], false), 100)).toEqual({
      status: "exhausted",
    });
  });
});

function createHistory(
  sequences: readonly number[],
  hasOlderMessages: boolean,
): ChatRoomEntryHistoryPageState {
  return {
    hasOlderMessages,
    messages: sequences.map(createMessage),
  };
}

function createMessage(roomSequence: number): ChatMessage {
  return {
    clientMessageId: `550e8400-e29b-41d4-a716-${String(roomSequence).padStart(12, "0")}`,
    content: `메시지 ${roomSequence}`,
    countable: true,
    createdAt: "2026-08-10T03:00:00Z",
    deletedAt: null,
    messageId: `message-${roomSequence}`,
    messageVersion: 1,
    roomId: "room-01",
    roomSequence,
    senderMembershipId: "membership-a",
    senderParticipationId: "participation-fixture",
    state: "ACTIVE",
    updatedAt: "2026-08-10T03:00:00Z",
  };
}
