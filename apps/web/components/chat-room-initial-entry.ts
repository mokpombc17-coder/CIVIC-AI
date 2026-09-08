import type { ChatRoomSessionView } from "@/lib/chat/realtime/chat-room-session-view";

export function shouldHoldChatRoomInitialEntry({
  hasRoomError,
  sessionKind,
  viewportPositioned,
}: Readonly<{
  hasRoomError: boolean;
  sessionKind: ChatRoomSessionView["kind"];
  viewportPositioned: boolean;
}>): boolean {
  if (hasRoomError) {
    return false;
  }

  return sessionKind === "pending" || (sessionKind === "active" && !viewportPositioned);
}
