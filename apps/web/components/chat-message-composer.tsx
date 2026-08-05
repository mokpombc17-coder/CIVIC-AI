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
          {...textareaBehaviorProps}
          className={`max-h-32 min-w-0 flex-1 resize-none overflow-y-auto rounded-xl border border-slate-300 px-4 py-3 leading-6 ${
            disabled ? "cursor-not-allowed bg-slate-100 text-slate-500" : "bg-white text-slate-950"
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
