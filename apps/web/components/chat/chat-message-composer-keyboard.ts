export type ChatMessageComposerKeyAction = "ignore" | "insert-newline" | "submit";

type ChatMessageComposerKeyEvent = Readonly<{
  isComposing: boolean;
  key: string;
  keyCode?: number;
  shiftKey: boolean;
}>;

const LEGACY_IME_KEY_CODE = 229;

export function getChatMessageComposerKeyAction({
  isComposing,
  key,
  keyCode,
  shiftKey,
}: ChatMessageComposerKeyEvent): ChatMessageComposerKeyAction {
  if (key !== "Enter" || isComposing || keyCode === LEGACY_IME_KEY_CODE) {
    return "ignore";
  }

  return shiftKey ? "insert-newline" : "submit";
}
