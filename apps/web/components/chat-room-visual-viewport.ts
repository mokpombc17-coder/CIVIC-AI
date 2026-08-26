type ChatRoomVisibleHeightOptions = Readonly<{
  bottomGap: number;
  viewportHeight: number;
}>;

type ChatRoomVisualViewportLayoutOptions = ChatRoomVisibleHeightOptions &
  Readonly<{
    layoutViewportHeight: number;
    viewportOffsetTop: number;
  }>;

export type ChatRoomVisualViewportLayout = Readonly<{
  alignSelf: "" | "start";
  height: number;
  marginTop: string;
}>;

export function calculateChatRoomVisibleHeight({
  bottomGap,
  viewportHeight,
}: ChatRoomVisibleHeightOptions): number {
  return Math.max(0, Math.floor(viewportHeight - bottomGap));
}

export function calculateChatRoomVisualViewportLayout({
  bottomGap,
  layoutViewportHeight,
  viewportHeight,
  viewportOffsetTop,
}: ChatRoomVisualViewportLayoutOptions): ChatRoomVisualViewportLayout {
  const isVisualViewportConstrained = viewportHeight < layoutViewportHeight;

  return {
    alignSelf: isVisualViewportConstrained ? "start" : "",
    height: calculateChatRoomVisibleHeight({ bottomGap, viewportHeight }),
    marginTop: isVisualViewportConstrained ? `${Math.max(0, Math.floor(viewportOffsetTop))}px` : "",
  };
}
