export type ChatRoomScreenOverlayKind = "membership" | "message-actions";

export function resolveChatRoomScreenOverlayKind({
  hasMessageActions,
  isMembershipDialogOpen,
  roomAvailable,
}: Readonly<{
  hasMessageActions: boolean;
  isMembershipDialogOpen: boolean;
  roomAvailable: boolean;
}>): ChatRoomScreenOverlayKind | null {
  if (roomAvailable && isMembershipDialogOpen) {
    return "membership";
  }

  return hasMessageActions ? "message-actions" : null;
}
