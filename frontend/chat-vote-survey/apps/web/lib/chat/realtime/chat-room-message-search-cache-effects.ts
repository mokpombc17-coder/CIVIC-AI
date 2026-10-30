import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";
import { normalizeRoomMessageSearchQuery } from "../chat-room-contracts";
import type {
  ChatMessage,
  RoomMessageContextResponse,
  RoomMessageSearchResponse,
} from "../chat-room-contracts";
import { chatRoomQueryKeys } from "../chat-room-queries";
import type { ChatRealtimeEventDelivery } from "./chat-realtime-event-buffer";

type BufferedMessageEvent = Extract<
  ChatRealtimeEventDelivery["events"][number],
  { kind: "message" }
>;

export type ChatRoomMessageSearchCacheEffectResult = Readonly<{
  contextQueryCount: number;
  searchQueryCount: number;
}>;

export function applyChatRoomMessageSearchCacheEffects(
  queryClient: QueryClient,
  roomId: string,
  generation: number,
  events: readonly BufferedMessageEvent[],
): ChatRoomMessageSearchCacheEffectResult {
  const snapshots = events
    .filter(
      ({ event }) =>
        event.eventType === "CHAT_MESSAGE_UPDATED" || event.eventType === "CHAT_MESSAGE_DELETED",
    )
    .map(({ event }) => event.payload);

  if (snapshots.length === 0) {
    return { contextQueryCount: 0, searchQueryCount: 0 };
  }

  let searchQueryCount = 0;

  for (const [queryKey, current] of queryClient.getQueriesData<
    InfiniteData<RoomMessageSearchResponse, string | null>
  >({ queryKey: chatRoomQueryKeys.messageSearchesForRoom(roomId) })) {
    const criteria = getQueryCriteria(queryKey);

    if (!current || criteria?.generation !== generation || typeof criteria.query !== "string") {
      continue;
    }

    const next = snapshots.reduce(
      (data, snapshot) => updateSearchData(data, snapshot, criteria.query as string),
      current,
    );

    if (next !== current) {
      queryClient.setQueryData(queryKey, next);
      searchQueryCount += 1;
    }
  }

  let contextQueryCount = 0;

  for (const [queryKey, current] of queryClient.getQueriesData<RoomMessageContextResponse>({
    queryKey: chatRoomQueryKeys.messageContextsForRoom(roomId),
  })) {
    const criteria = getQueryCriteria(queryKey);

    if (!current || criteria?.generation !== generation) {
      continue;
    }

    const next = snapshots.reduce(updateContextData, current);

    if (next !== current) {
      queryClient.setQueryData(queryKey, next);
      contextQueryCount += 1;
    }
  }

  return { contextQueryCount, searchQueryCount };
}

function updateSearchData(
  data: InfiniteData<RoomMessageSearchResponse, string | null>,
  snapshot: ChatMessage,
  query: string,
): InfiniteData<RoomMessageSearchResponse, string | null> {
  let changed = false;
  const pages = data.pages.map((page) => {
    const index = page.items.findIndex((message) => message.messageId === snapshot.messageId);

    if (index < 0) {
      return page;
    }

    const current = page.items[index]!;

    if (snapshot.messageVersion <= current.messageVersion) {
      return page;
    }

    changed = true;
    const replacement =
      snapshot.state === "ACTIVE" && snapshot.content !== null && snapshot.countable
        ? { ...snapshot, countable: true as const }
        : null;
    const matches =
      replacement !== null && normalizeRoomMessageSearchQuery(replacement.content).includes(query);

    return {
      ...page,
      items: matches
        ? page.items.map((message, itemIndex) => (itemIndex === index ? replacement : message))
        : page.items.filter((_message, itemIndex) => itemIndex !== index),
    };
  });

  return changed ? { ...data, pages } : data;
}

function updateContextData(
  data: RoomMessageContextResponse,
  snapshot: ChatMessage,
): RoomMessageContextResponse {
  const index = data.items.findIndex((message) => message.messageId === snapshot.messageId);

  if (index < 0 || snapshot.messageVersion <= data.items[index]!.messageVersion) {
    return data;
  }

  return {
    ...data,
    items: data.items.map((message, itemIndex) => (itemIndex === index ? snapshot : message)),
  };
}

function getQueryCriteria(queryKey: QueryKey): Record<string, unknown> | null {
  const criteria = queryKey.at(-1);
  return criteria !== null && typeof criteria === "object"
    ? (criteria as Record<string, unknown>)
    : null;
}
