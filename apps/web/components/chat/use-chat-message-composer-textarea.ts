"use client";

import { useLayoutEffect, useRef, type KeyboardEventHandler, type RefObject } from "react";
import { getChatMessageComposerKeyAction } from "./chat-message-composer-keyboard";

const MAX_TEXTAREA_HEIGHT = 128;

type UseChatMessageComposerTextareaOptions = Readonly<{
  canSend: boolean;
  draft: string;
  onSubmit: () => void;
}>;

type ChatMessageComposerTextareaBehavior = Readonly<{
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  ref: RefObject<HTMLTextAreaElement | null>;
}>;

export function useChatMessageComposerTextarea({
  canSend,
  draft,
  onSubmit,
}: UseChatMessageComposerTextareaOptions): ChatMessageComposerTextareaBehavior {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [draft]);

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    const action = getChatMessageComposerKeyAction({
      isComposing: event.nativeEvent.isComposing,
      key: event.key,
      keyCode: event.nativeEvent.keyCode,
      shiftKey: event.shiftKey,
    });

    if (action !== "submit") {
      return;
    }

    event.preventDefault();

    if (canSend) {
      onSubmit();
    }
  };

  return {
    onKeyDown: handleKeyDown,
    ref: textareaRef,
  };
}
