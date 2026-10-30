import type { ChatRoomSessionView } from "@/lib/chat/realtime/chat-room-session-view";

export function shouldHoldChatRoomInitialEntry({
  entryNavigationNeedsAction,
  hasRoomError,
  sessionKind,
  viewportPositioned,
}: Readonly<{
  entryNavigationNeedsAction: boolean;
  hasRoomError: boolean;
  sessionKind: ChatRoomSessionView["kind"];
  viewportPositioned: boolean;
}>): boolean {
  if (hasRoomError) {
    return false;
  }

  // 읽은 위치 찾기가 사용자 조작을 기다리면 viewport 위치가 정해지지 않으므로 로딩을 유지하지 않음
  if (entryNavigationNeedsAction) {
    return false;
  }

  return sessionKind === "pending" || (sessionKind === "active" && !viewportPositioned);
}
