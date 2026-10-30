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

type PlatformTextEntryOptions = Readonly<{
  contentEditable?: boolean;
  disabled?: boolean;
  inputType?: string;
  readOnly?: boolean;
  tagName: string;
}>;

const MINIMUM_KEYBOARD_VIEWPORT_REDUCTION = 80;
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

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

export function isPlatformTextEntry({
  contentEditable = false,
  disabled = false,
  inputType = "text",
  readOnly = false,
  tagName,
}: PlatformTextEntryOptions): boolean {
  if (disabled || readOnly) {
    return false;
  }

  const normalizedTagName = tagName.toLowerCase();

  if (normalizedTagName === "textarea" || contentEditable) {
    return true;
  }

  return normalizedTagName === "input" && !NON_TEXT_INPUT_TYPES.has(inputType.toLowerCase());
}
