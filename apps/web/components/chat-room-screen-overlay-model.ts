export type ChatRoomScreenOverlayKind = "message-search" | "membership" | "message-actions";

export function resolveChatRoomScreenOverlayKind({
  hasMessageActions,
  isMembershipDialogOpen,
  isMessageSearchDialogOpen,
  roomAvailable,
}: Readonly<{
  hasMessageActions: boolean;
  isMembershipDialogOpen: boolean;
  isMessageSearchDialogOpen: boolean;
  roomAvailable: boolean;
}>): ChatRoomScreenOverlayKind | null {
  if (roomAvailable && isMessageSearchDialogOpen) {
    return "message-search";
  }

  if (roomAvailable && isMembershipDialogOpen) {
    return "membership";
  }

  return hasMessageActions ? "message-actions" : null;
}
