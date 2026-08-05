"use client";

import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { getChatMessageComposerKeyAction } from "./chat-message-composer-keyboard";

const MAX_TEXTAREA_HEIGHT = 128;

export type ChatMessageComposerProps = Readonly<{
  canSend: boolean;
  disabled: boolean;
  draft: string;
  inputId: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  validationError: string | null;
}>;

export function ChatMessageComposer({
  canSend,
  disabled,
  draft,
  inputId,
  onDraftChange,
  onSubmit,
  placeholder,
  validationError,
}: ChatMessageComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [draft]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
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
  }

  return (
    <>
      {validationError ? (
        <div className="border-t border-red-200 bg-red-50 px-5 py-3 text-red-950" role="alert">
          <p className="text-sm">{validationError}</p>
        </div>
      ) : null}

      <form
        className="flex items-end gap-3 border-t border-slate-200 bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label className="sr-only" htmlFor={inputId}>
          메시지
        </label>
        <textarea
          className={`max-h-32 min-w-0 flex-1 resize-none overflow-y-auto rounded-xl border border-slate-300 px-4 py-3 leading-6 ${
            disabled ? "cursor-not-allowed bg-slate-100 text-slate-500" : "bg-white text-slate-950"
          }`}
          disabled={disabled}
          enterKeyHint="send"
          id={inputId}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          ref={textareaRef}
          rows={1}
          value={draft}
        />
        <button
          className={`primary-button ${canSend ? "" : "cursor-not-allowed opacity-50"}`}
          disabled={!canSend}
          type="submit"
        >
          전송
        </button>
      </form>
    </>
  );
}
