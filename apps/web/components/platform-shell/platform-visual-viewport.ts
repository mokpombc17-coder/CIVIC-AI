type PlatformVisibleHeightOptions = Readonly<{
  bottomGap: number;
  viewportHeight: number;
}>;

type PlatformVisualViewportLayoutOptions = PlatformVisibleHeightOptions &
  Readonly<{
    viewportBaselineHeight: number;
    viewportOffsetTop: number;
  }>;

type PlatformVisualViewportConstraintOptions = Readonly<{
  hasFocusedTextEntry: boolean;
  viewportBaselineHeight: number;
  viewportHeight: number;
}>;

const MINIMUM_KEYBOARD_VIEWPORT_REDUCTION = 80;

export type PlatformVisualViewportLayout = Readonly<{
  alignSelf: "" | "start";
  height: number;
  marginTop: string;
}>;

export function calculatePlatformVisibleHeight({
  bottomGap,
  viewportHeight,
}: PlatformVisibleHeightOptions): number {
  return Math.max(0, Math.floor(viewportHeight - bottomGap));
}

export function calculatePlatformVisualViewportLayout({
  bottomGap,
  viewportBaselineHeight,
  viewportHeight,
  viewportOffsetTop,
}: PlatformVisualViewportLayoutOptions): PlatformVisualViewportLayout {
  const isVisualViewportConstrained = viewportHeight < viewportBaselineHeight;

  return {
    alignSelf: isVisualViewportConstrained ? "start" : "",
    height: calculatePlatformVisibleHeight({ bottomGap, viewportHeight }),
    marginTop: isVisualViewportConstrained ? `${Math.max(0, Math.floor(viewportOffsetTop))}px` : "",
  };
}

export function shouldConstrainPlatformToVisualViewport({
  hasFocusedTextEntry,
  viewportBaselineHeight,
  viewportHeight,
}: PlatformVisualViewportConstraintOptions): boolean {
  if (!hasFocusedTextEntry) {
    return false;
  }

  const viewportReduction = viewportBaselineHeight - viewportHeight;

  return viewportReduction >= MINIMUM_KEYBOARD_VIEWPORT_REDUCTION;
}
