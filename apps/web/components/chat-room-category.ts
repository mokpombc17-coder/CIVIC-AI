import type { RoomCategory } from "@/lib/chat/chat-room-contracts";

export const CHAT_ROOM_CATEGORY_OPTIONS = [
  "POLICY",
  "ENVIRONMENT",
  "LOCAL_ISSUE",
] as const satisfies readonly RoomCategory[];

const CHAT_ROOM_CATEGORY_LABELS = {
  POLICY: "정책",
  ENVIRONMENT: "환경",
  LOCAL_ISSUE: "지역 현안",
} as const satisfies Record<RoomCategory, string>;

export function getChatRoomCategoryLabel(category: RoomCategory): string {
  return CHAT_ROOM_CATEGORY_LABELS[category];
}
