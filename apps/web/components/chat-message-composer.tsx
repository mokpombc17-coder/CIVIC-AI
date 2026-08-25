"use client";

import { useChatMessageComposerTextarea } from "./use-chat-message-composer-textarea";

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
  const textareaBehaviorProps = useChatMessageComposerTextarea({
    canSend,
    draft,
    onSubmit,
  });

  return (
    <>
      {validationError ? (
        <div
          className="mx-4 mt-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-950"
          role="alert"
        >
          <p className="text-sm">{validationError}</p>
        </div>
      ) : null}

      <form
        className="m-4 mt-2 flex items-end gap-2 rounded-xl border border-[var(--chat-publishing-color-border)] bg-white p-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label className="sr-only" htmlFor={inputId}>
          메시지
        </label>
        <textarea
          {...textareaBehaviorProps}
          className={`max-h-32 min-h-[72px] min-w-0 flex-1 resize-none overflow-y-auto rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-muted)] px-3 py-2.5 text-[15px] leading-[1.5] ${
            disabled
              ? "cursor-not-allowed bg-[var(--chat-publishing-color-neutral-soft)] text-[var(--chat-publishing-color-muted)]"
              : "bg-white text-[var(--chat-publishing-color-text)]"
          }`}
          disabled={disabled}
          enterKeyHint="send"
          id={inputId}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder={placeholder}
          rows={1}
          value={draft}
        />
        <button
          className={`inline-flex h-12 w-16 shrink-0 items-center justify-center rounded-[var(--chat-publishing-radius-control)] bg-[var(--chat-publishing-color-primary)] text-[15px] font-bold text-white transition hover:bg-[var(--chat-publishing-color-primary-emphasis)] ${canSend ? "" : "cursor-not-allowed opacity-50"}`}
          disabled={!canSend}
          type="submit"
        >
          전송
        </button>
      </form>
    </>
  );
}
