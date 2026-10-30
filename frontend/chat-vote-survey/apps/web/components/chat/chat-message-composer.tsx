"use client";

import { useChatMessageComposerTextarea } from "./use-chat-message-composer-textarea";

export type ChatMessageComposerProps = Readonly<{
  canSend: boolean;
  disabled: boolean;
  disabledAppearance?: "muted" | "stable";
  disabledMessage?: string | null;
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
  disabledAppearance = "muted",
  disabledMessage = null,
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
  const showMutedDisabledAppearance = disabled && disabledAppearance === "muted";

  return (
    <>
      {validationError ? (
        <div
          className="mx-4 mb-2 rounded-[var(--chat-publishing-radius-control)] border border-[#ffc95c] bg-[#fff7e8] px-4 py-3 text-[#7a4b00]"
          data-chat-message-composer-state="validation-error"
          role="alert"
        >
          <p className="text-sm font-semibold leading-5">{validationError}</p>
        </div>
      ) : null}

      {disabledMessage ? (
        <p
          aria-live="polite"
          className="mx-4 mb-2 rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-border)] bg-[var(--chat-publishing-color-neutral-soft)] px-4 py-2.5 text-sm font-medium leading-5 text-[var(--chat-publishing-color-muted)]"
          data-chat-message-composer-state="disabled"
          role="status"
        >
          {disabledMessage}
        </p>
      ) : null}

      <form
        className={`mx-4 mb-4 flex items-end gap-2 rounded-[var(--chat-publishing-radius-card)] border p-3 transition ${
          showMutedDisabledAppearance
            ? "border-[var(--chat-publishing-color-border)] bg-[var(--chat-publishing-color-neutral-soft)]"
            : "border-[var(--chat-publishing-color-border)] bg-white focus-within:border-[var(--chat-publishing-color-primary)] focus-within:ring-2 focus-within:ring-[var(--chat-publishing-color-accent-soft)]"
        }`}
        data-chat-message-composer-state={disabled ? "disabled-form" : "ready"}
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
          className={`max-h-32 min-h-[72px] min-w-0 flex-1 resize-none overflow-y-auto rounded-[var(--chat-publishing-radius-control)] border px-3 py-2.5 text-[15px] leading-[1.5] outline-none ${
            showMutedDisabledAppearance
              ? "cursor-not-allowed border-transparent bg-transparent text-[var(--chat-publishing-color-muted)]"
              : `border-[var(--chat-publishing-color-border)] bg-white text-[var(--chat-publishing-color-text)] ${
                  disabled ? "cursor-not-allowed" : ""
                }`
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
          className={`inline-flex h-12 w-16 shrink-0 items-center justify-center rounded-[var(--chat-publishing-radius-control)] text-[15px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)] ${
            canSend
              ? "bg-[var(--chat-publishing-color-primary)] text-white hover:bg-[var(--chat-publishing-color-primary-emphasis)]"
              : "cursor-not-allowed border border-[var(--chat-publishing-color-border)] bg-[var(--chat-publishing-color-neutral-soft)] text-[var(--chat-publishing-color-muted)]"
          }`}
          disabled={!canSend}
          type="submit"
        >
          전송
        </button>
      </form>
    </>
  );
}
