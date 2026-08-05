type ChatRoomVisibleHeightOptions = Readonly<{
  bottomGap: number;
  viewportHeight: number;
}>;

export function calculateChatRoomVisibleHeight({
  bottomGap,
  viewportHeight,
}: ChatRoomVisibleHeightOptions): number {
  return Math.max(0, Math.floor(viewportHeight - bottomGap));
}
