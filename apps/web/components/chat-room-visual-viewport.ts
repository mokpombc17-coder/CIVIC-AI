type ChatRoomVisibleHeightOptions = Readonly<{
  bottomGap: number;
  viewportHeight: number;
}>;

type ChatRoomVisualViewportLayoutOptions = ChatRoomVisibleHeightOptions &
  Readonly<{
    viewportBaselineHeight: number;
    viewportOffsetTop: number;
  }>;

type ChatRoomVisualViewportConstraintOptions = Readonly<{
  hasFocusedTextEntry: boolean;
  viewportBaselineHeight: number;
  viewportHeight: number;
}>;

const MINIMUM_KEYBOARD_VIEWPORT_REDUCTION = 80;

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
  viewportBaselineHeight,
  viewportHeight,
  viewportOffsetTop,
}: ChatRoomVisualViewportLayoutOptions): ChatRoomVisualViewportLayout {
  const isVisualViewportConstrained = viewportHeight < viewportBaselineHeight;

  return {
    alignSelf: isVisualViewportConstrained ? "start" : "",
    height: calculateChatRoomVisibleHeight({ bottomGap, viewportHeight }),
    marginTop: isVisualViewportConstrained ? `${Math.max(0, Math.floor(viewportOffsetTop))}px` : "",
  };
}

export function shouldConstrainChatRoomToVisualViewport({
  hasFocusedTextEntry,
  viewportBaselineHeight,
  viewportHeight,
}: ChatRoomVisualViewportConstraintOptions): boolean {
  if (!hasFocusedTextEntry) {
    return false;
  }

  const viewportReduction = viewportBaselineHeight - viewportHeight;

  return viewportReduction >= MINIMUM_KEYBOARD_VIEWPORT_REDUCTION;
}
