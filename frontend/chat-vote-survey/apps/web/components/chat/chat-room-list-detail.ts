import type { PublicRoomListItem, RoomInboxListItem } from "@/lib/chat/chat-room-contracts";

const CHAT_ROOM_LIST_DETAIL_TRIGGER_ID_PREFIX = "chat-room-list-detail-trigger-";

export function getChatRoomListDetailTriggerId(roomId: string): string {
  return `${CHAT_ROOM_LIST_DETAIL_TRIGGER_ID_PREFIX}${roomId}`;
}

export type ChatRoomListDetailSelection =
  | Readonly<{
      kind: "participating";
      room: RoomInboxListItem;
    }>
  | Readonly<{
      kind: "available";
      room: PublicRoomListItem;
    }>;

export type ChatRoomListDetailController = Readonly<{
  close: () => void;
  open: (selection: ChatRoomListDetailSelection, trigger: HTMLButtonElement) => void;
  selection: ChatRoomListDetailSelection | null;
}>;
