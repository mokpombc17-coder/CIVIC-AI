import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type {
  ChatMessage,
  RoomMessageContextResponse,
  RoomMessageSearchResponse,
} from "../chat-room-contracts";
import { chatRoomQueryKeys } from "../chat-room-queries";
import type { ChatRealtimeEventDelivery } from "./chat-realtime-event-buffer";
import { applyChatRoomMessageSearchCacheEffects } from "./chat-room-message-search-cache-effects";

type BufferedMessageEvent = Extract<
  ChatRealtimeEventDelivery["events"][number],
  { kind: "message" }
>;

describe("Room message search realtime cache effects", () => {
  it("UPDATE는 기존 검색 결과만 갱신하고 현재 query와 달라지면 제거한다", () => {
    const queryClient = new QueryClient();
    const queryKey = createSearchQueryKey(1, "환경 정책");
    const staleGenerationKey = createSearchQueryKey(2, "환경 정책");
    const initial = createSearchData([createMessage(10, "환경 정책 이야기")]);
    queryClient.setQueryData(queryKey, initial);
    queryClient.setQueryData(staleGenerationKey, initial);

    const matchingUpdate = createMessage(10, "환경   정책 이야기 수정", 2);
    const firstResult = applyChatRoomMessageSearchCacheEffects(queryClient, "room-01", 1, [
      createBufferedMessageEvent("CHAT_MESSAGE_UPDATED", matchingUpdate),
    ]);

    expect(firstResult).toEqual({ contextQueryCount: 0, searchQueryCount: 1 });
    expect(getSearchItems(queryClient, queryKey)).toEqual([matchingUpdate]);
    expect(getSearchItems(queryClient, staleGenerationKey)).toEqual(initial.pages[0]?.items);

    const nonmatchingUpdate = createMessage(10, "다른 주제", 3);
    applyChatRoomMessageSearchCacheEffects(queryClient, "room-01", 1, [
      createBufferedMessageEvent("CHAT_MESSAGE_UPDATED", nonmatchingUpdate),
    ]);

    expect(getSearchItems(queryClient, queryKey)).toEqual([]);
  });

  it("CREATE는 고정된 검색 session에 새 결과를 삽입하지 않는다", () => {
    const queryClient = new QueryClient();
    const queryKey = createSearchQueryKey(1, "환경 정책");
    queryClient.setQueryData(queryKey, createSearchData([]));

    const result = applyChatRoomMessageSearchCacheEffects(queryClient, "room-01", 1, [
      createBufferedMessageEvent(
        "CHAT_MESSAGE_CREATED",
        createMessage(11, "환경 정책 신규 메시지"),
      ),
    ]);

    expect(result).toEqual({ contextQueryCount: 0, searchQueryCount: 0 });
    expect(getSearchItems(queryClient, queryKey)).toEqual([]);
  });

  it("DELETE는 검색 결과에서 제거하고 열린 Context에는 tombstone을 유지한다", () => {
    const queryClient = new QueryClient();
    const message = createMessage(10, "환경 정책 이야기");
    const deleted = createDeletedMessage(message);
    const searchKey = createSearchQueryKey(1, "환경 정책");
    const contextKey = chatRoomQueryKeys.messageContext("room-01", message.messageId, 1, 20, 20);
    queryClient.setQueryData(searchKey, createSearchData([message]));
    queryClient.setQueryData(contextKey, createContextData(message));

    const result = applyChatRoomMessageSearchCacheEffects(queryClient, "room-01", 1, [
      createBufferedMessageEvent("CHAT_MESSAGE_DELETED", deleted),
    ]);

    expect(result).toEqual({ contextQueryCount: 1, searchQueryCount: 1 });
    expect(getSearchItems(queryClient, searchKey)).toEqual([]);
    expect(queryClient.getQueryData<RoomMessageContextResponse>(contextKey)?.items).toEqual([
      deleted,
    ]);
  });
});

function createSearchQueryKey(generation: number, query: string) {
  return chatRoomQueryKeys.messageSearch("room-01", {
    generation,
    sessionGeneration: 1,
    query,
    limit: 20,
  });
}

function createSearchData(
  items: readonly ChatMessage[],
): InfiniteData<RoomMessageSearchResponse, string | null> {
  return {
    pageParams: [null],
    pages: [
      {
        items: items.flatMap((message) =>
          message.state === "ACTIVE" && message.countable
            ? [{ ...message, countable: true as const }]
            : [],
        ),
        nextCursor: null,
        searchComplete: true,
      },
    ],
  };
}

function createContextData(message: ChatMessage): RoomMessageContextResponse {
  return {
    targetMessageId: message.messageId,
    targetRoomSequence: message.roomSequence,
    items: [message],
    nextBeforeSequence: null,
    nextAfterSequence: null,
    hasOlder: false,
    hasNewer: false,
  };
}

function createMessage(sequence: number, content: string, messageVersion = 1): ChatMessage {
  return {
    messageId: `message-${sequence}`,
    roomId: "room-01",
    roomSequence: sequence,
    senderMembershipId: "membership-02",
    senderParticipationId: "participation-fixture",
    clientMessageId: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    content,
    state: "ACTIVE",
    countable: true,
    messageVersion,
    createdAt: "2026-08-10T07:00:00Z",
    updatedAt: "2026-08-10T07:00:00Z",
    deletedAt: null,
  };
}

function createDeletedMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    content: null,
    state: "DELETED_BY_AUTHOR",
    messageVersion: message.messageVersion + 1,
    updatedAt: "2026-08-10T07:05:00Z",
    deletedAt: "2026-08-10T07:05:00Z",
  };
}

function createBufferedMessageEvent(
  eventType: "CHAT_MESSAGE_CREATED" | "CHAT_MESSAGE_UPDATED" | "CHAT_MESSAGE_DELETED",
  payload: ChatMessage,
): BufferedMessageEvent {
  return {
    bufferSequence: 1,
    kind: "message",
    event: {
      eventVersion: 2,
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      eventType,
      emittedAt: "2026-08-10T07:05:00Z",
      payload,
    },
  } as BufferedMessageEvent;
}

function getSearchItems(
  queryClient: QueryClient,
  queryKey: ReturnType<typeof createSearchQueryKey>,
) {
  return queryClient.getQueryData<InfiniteData<RoomMessageSearchResponse, string | null>>(queryKey)
    ?.pages[0]?.items;
}
