import type { RoomInboxListItem } from "@/lib/chat/chat-room-contracts";

export const CHAT_ROOM_INBOX_FILTER_OPTIONS = ["ALL", "UNREAD"] as const;

export type ChatRoomInboxFilter = (typeof CHAT_ROOM_INBOX_FILTER_OPTIONS)[number];

export type ChatRoomInboxFilterController = Readonly<{
  select: (filter: ChatRoomInboxFilter) => void;
  value: ChatRoomInboxFilter;
}>;

export function parseChatRoomInboxFilter(
  value: string | readonly string[] | undefined,
): ChatRoomInboxFilter {
  const requestedFilter = Array.isArray(value) ? value[0] : value;

  return requestedFilter === "unread" ? "UNREAD" : "ALL";
}

export function getChatRoomListHref(filter: ChatRoomInboxFilter): "/chat" | "/chat?filter=unread" {
  return filter === "UNREAD" ? "/chat?filter=unread" : "/chat";
}

/**
 * 서버 검색 조건이 아니라 현재 Room inbox query에 누적된 항목에만 적용하는 UI filter다.
 */
export function filterLoadedRoomInboxItems(
  rooms: readonly RoomInboxListItem[],
  filter: ChatRoomInboxFilter,
): readonly RoomInboxListItem[] {
  if (filter === "ALL") {
    return rooms;
  }

  return rooms.filter((room) => room.unreadCount > 0);
}

export type RoomInboxFilterPaging = Readonly<{
  filter: ChatRoomInboxFilter;
  hasNextPage: boolean;
  isError: boolean;
  visibleRoomCount: number;
}>;

/**
 * 안읽음 filter 결과가 비었는데 다음 page가 남아 있으면 모든 방을 확인하기 전이므로
 * 완료 상태 대신 다음 page를 이어서 불러와야 하는지 판단함.
 */
export function shouldContinueLoadingFilteredRoomInbox({
  filter,
  hasNextPage,
  isError,
  visibleRoomCount,
}: RoomInboxFilterPaging): boolean {
  return filter === "UNREAD" && visibleRoomCount === 0 && hasNextPage && !isError;
}
