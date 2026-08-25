import type { PublicRoomListItem, RoomInboxListItem } from "@/lib/chat/chat-room-contracts";

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
