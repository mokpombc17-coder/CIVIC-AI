import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat/chat-room-contracts";
import {
  createChatRoomEntryHistoryPageState,
  shouldLoadNextParticipantProfilesPage,
} from "./use-chat-room-screen-data";

describe("chat room screen data", () => {
  it("활성 상태에서 후속 profile page가 있고 요청·오류가 없을 때만 자동 로드한다", () => {
    expect(
      shouldLoadNextParticipantProfilesPage({
        enabled: true,
        hasNextPage: true,
        isFetchNextPageError: false,
        isFetchingNextPage: false,
      }),
    ).toBe(true);

    for (const blocked of [
      { enabled: false },
      { hasNextPage: false },
      { isFetchNextPageError: true },
      { isFetchingNextPage: true },
    ]) {
      expect(
        shouldLoadNextParticipantProfilesPage({
          enabled: blocked.enabled ?? true,
          hasNextPage: blocked.hasNextPage ?? true,
          isFetchNextPageError: blocked.isFetchNextPageError ?? false,
          isFetchingNextPage: blocked.isFetchingNextPage ?? false,
        }),
      ).toBe(false);
    }
  });

  it("현재 message snapshot을 진입 위치 탐색용 page state로 변환한다", () => {
    const messages = [MESSAGE];
    const state = createChatRoomEntryHistoryPageState(messages, true);

    expect(state).toEqual({
      hasOlderMessages: true,
      messages,
    });
    expect(state.messages).toBe(messages);
    expect(Object.isFrozen(state)).toBe(true);
  });
});

const MESSAGE = {
  clientMessageId: "550e8400-e29b-41d4-a716-446655440001",
  content: "확정 메시지",
  countable: true,
  createdAt: "2026-08-10T03:00:00Z",
  deletedAt: null,
  messageId: "message-01",
  messageVersion: 1,
  roomId: "room-01",
  roomSequence: 2,
  senderMembershipId: "membership-02",
  state: "ACTIVE",
  updatedAt: "2026-08-10T03:00:00Z",
} satisfies ChatMessage;
