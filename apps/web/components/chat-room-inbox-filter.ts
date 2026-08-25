import type { RoomInboxListItem } from "@/lib/chat/chat-room-contracts";

export const CHAT_ROOM_INBOX_FILTER_OPTIONS = ["ALL", "UNREAD"] as const;

export type ChatRoomInboxFilter = (typeof CHAT_ROOM_INBOX_FILTER_OPTIONS)[number];

export type ChatRoomInboxFilterController = Readonly<{
  select: (filter: ChatRoomInboxFilter) => void;
  value: ChatRoomInboxFilter;
}>;

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
