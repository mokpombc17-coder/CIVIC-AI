"use client";

import Image from "next/image";
import { useId, type KeyboardEvent, type ReactNode } from "react";
import type { ChatMessageActionsBottomSheetViewModel } from "@/components/use-chat-message-actions-bottom-sheet";

const SECONDARY_BUTTON_CLASS_NAME =
  "inline-flex min-h-12 flex-1 items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-border)] bg-white px-4 text-base font-bold text-[var(--chat-publishing-color-text)] transition hover:bg-[var(--chat-publishing-color-neutral-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)] disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY_BUTTON_CLASS_NAME =
  "inline-flex min-h-12 flex-1 items-center justify-center rounded-[var(--chat-publishing-radius-control)] bg-[var(--chat-publishing-color-primary)] px-4 text-base font-bold text-white transition hover:bg-[var(--chat-publishing-color-primary-emphasis)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)] disabled:cursor-not-allowed disabled:opacity-50";
const DANGER_BUTTON_CLASS_NAME =
  "inline-flex min-h-12 flex-1 items-center justify-center rounded-[var(--chat-publishing-radius-control)] bg-[#b42318] px-4 text-base font-bold text-white transition hover:bg-[#912018] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b42318] disabled:cursor-not-allowed disabled:opacity-50";
const ERROR_CLASS_NAME =
  "rounded-[var(--chat-publishing-radius-control)] border border-[#ffc95c] bg-[#fff7e8] px-4 py-3 text-sm font-semibold leading-5 text-[#7a4b00]";

export function ChatMessageActionsBottomSheet({
  sheet,
}: {
  sheet: ChatMessageActionsBottomSheetViewModel;
}) {
  const titleId = useId();
  const editInputId = useId();
  const editErrorId = useId();
  const title =
    sheet.mode === "edit" ? "메시지 수정" : sheet.mode === "delete" ? "메시지 삭제" : "메시지";

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      sheet.onClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute("hidden"));
    const first = focusableElements[0];
    const last = focusableElements.at(-1);

    if (!first || !last) {
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="relative flex size-full items-end justify-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          sheet.onBackdropClick();
        }
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="relative max-h-[calc(100%-1rem)] w-full max-w-[393px] overflow-y-auto rounded-t-[var(--platform-shell-radius)] border border-b-0 border-[var(--chat-publishing-color-border)] bg-white px-6 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[var(--chat-publishing-color-text)] shadow-[0_16px_40px_rgba(18,20,23,0.2)]"
        data-chat-message-actions-sheet="true"
        onKeyDown={handleKeyDown}
        role="dialog"
      >
        <div className="flex min-h-11 items-start justify-between gap-4">
          <h2 className="min-w-0 pt-1 text-2xl font-bold leading-[32.4px]" id={titleId}>
            {title}
          </h2>
          <button
            aria-label="메시지 작업 닫기"
            className="flex size-11 shrink-0 items-center justify-center rounded-[var(--chat-publishing-radius-control)] transition hover:bg-[var(--chat-publishing-color-neutral-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
            onClick={sheet.onClose}
            type="button"
          >
            <Image alt="" aria-hidden="true" height={24} src="/assets/chat/close.png" width={24} />
          </button>
        </div>

        {sheet.mode === "menu" && sheet.copyStatus === "copied" ? (
          <p
            className="mt-2 rounded-[var(--chat-publishing-radius-control)] bg-[var(--chat-publishing-color-accent-soft)] px-4 py-3 text-sm font-semibold text-[var(--chat-publishing-color-primary-emphasis)]"
            role="status"
          >
            메시지를 클립보드에 복사했습니다.
          </p>
        ) : null}

        {sheet.mode === "delete" ? (
          <div className="mt-2">
            <p className="text-base font-semibold leading-6 text-[var(--chat-publishing-color-muted)]">
              정말 이 메시지를 삭제하시겠습니까?
            </p>
          </div>
        ) : null}

        {sheet.mode === "edit" ? (
          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              sheet.onEditSubmit();
            }}
          >
            {sheet.error ? (
              <p className={ERROR_CLASS_NAME} id={editErrorId} role="alert">
                {sheet.error}
              </p>
            ) : null}
            <label
              className={`${sheet.error ? "mt-4 " : ""}block text-[13px] font-medium leading-5 text-[var(--chat-publishing-color-muted)]`}
              htmlFor={editInputId}
            >
              선택한 메시지
            </label>
            <textarea
              autoFocus
              aria-describedby={sheet.error ? editErrorId : undefined}
              className="mt-2 min-h-32 w-full resize-none rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-border)] bg-[var(--chat-publishing-color-neutral-soft)] px-4 py-3 text-sm leading-6 text-[var(--chat-publishing-color-text)] outline-none transition placeholder:text-[var(--chat-publishing-color-muted)] focus:border-[var(--chat-publishing-color-primary)] focus:ring-2 focus:ring-[var(--chat-publishing-color-accent-soft)] disabled:cursor-not-allowed disabled:opacity-50"
              data-chat-message-edit-input="true"
              disabled={sheet.isPending}
              id={editInputId}
              onChange={(event) => sheet.onDraftChange(event.target.value)}
              value={sheet.draft}
            />
            <div className="mt-4 flex gap-2">
              <button
                className={SECONDARY_BUTTON_CLASS_NAME}
                disabled={sheet.isPending}
                onClick={() => sheet.onModeChange("menu")}
                type="button"
              >
                취소
              </button>
              <button
                className={PRIMARY_BUTTON_CLASS_NAME}
                disabled={sheet.isPending}
                type="submit"
              >
                {sheet.isPending ? "수정 중…" : "저장"}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-4">
            <p className="text-[13px] font-medium leading-5 text-[var(--chat-publishing-color-muted)]">
              선택한 메시지
            </p>
            <div
              className="mt-2 flex min-h-14 items-start gap-3 rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-border)] bg-[var(--chat-publishing-color-neutral-soft)] px-4 py-3"
              data-chat-message-preview="true"
            >
              <p className="max-h-32 min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-[var(--chat-publishing-color-text)]">
                {sheet.content}
              </p>
            </div>
          </div>
        )}

        {sheet.mode === "menu" ? (
          <div className={`mt-4 grid ${sheet.canMutate ? "grid-cols-3 gap-2" : "grid-cols-1"}`}>
            <MessageActionButton
              autoFocus
              disabled={sheet.isPending || sheet.copyStatus === "copying"}
              icon={<CopyIcon />}
              label={
                sheet.copyStatus === "copying"
                  ? "복사 중…"
                  : sheet.copyStatus === "copied"
                    ? "복사됨"
                    : "복사"
              }
              onClick={sheet.onCopy}
            />
            {sheet.canMutate ? (
              <>
                <MessageActionButton
                  disabled={sheet.isPending || sheet.copyStatus === "copying"}
                  icon={<EditIcon />}
                  label="수정"
                  onClick={() => sheet.onModeChange("edit")}
                />
                <MessageActionButton
                  danger
                  disabled={sheet.isPending || sheet.copyStatus === "copying"}
                  icon={<DeleteIcon />}
                  label="삭제"
                  onClick={() => sheet.onModeChange("delete")}
                />
              </>
            ) : null}
          </div>
        ) : null}

        {sheet.mode === "delete" ? (
          <div className="mt-4 flex gap-2">
            <button
              autoFocus
              className={SECONDARY_BUTTON_CLASS_NAME}
              disabled={sheet.isPending}
              onClick={() => sheet.onModeChange("menu")}
              type="button"
            >
              취소
            </button>
            <button
              className={DANGER_BUTTON_CLASS_NAME}
              disabled={sheet.isPending}
              onClick={sheet.onConfirmDelete}
              type="button"
            >
              {sheet.isPending ? "삭제 중…" : "삭제"}
            </button>
          </div>
        ) : null}

        {sheet.mode !== "edit" && sheet.error ? (
          <p className={`mt-4 ${ERROR_CLASS_NAME}`} role="alert">
            {sheet.error}
          </p>
        ) : null}

        {sheet.isPending && sheet.isRetryWaiting ? (
          <p className="mt-3 text-sm text-[var(--chat-publishing-color-muted)]" role="status">
            잠시 후 자동으로 다시 시도합니다.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function MessageActionButton({
  autoFocus = false,
  danger = false,
  disabled,
  icon,
  label,
  onClick,
}: Readonly<{
  autoFocus?: boolean;
  danger?: boolean;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}>) {
  return (
    <button
      autoFocus={autoFocus}
      className={`flex min-h-12 w-full items-center justify-center gap-1 rounded-[var(--chat-publishing-radius-control)] border bg-white px-2 py-1.5 text-center text-base font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)] disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? "border-[#f2b8b5] text-[#b42318] hover:bg-[#fff1f0]"
          : "border-[var(--chat-publishing-color-border)] text-[var(--chat-publishing-color-text)] hover:bg-[var(--chat-publishing-color-neutral-soft)]"
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span
        aria-hidden="true"
        className={`flex size-7 shrink-0 items-center justify-center ${
          danger ? "text-[#b42318]" : "text-[var(--chat-publishing-color-muted)]"
        }`}
      >
        {icon}
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function CopyIcon() {
  return (
    <svg fill="none" height="22" viewBox="0 0 24 24" width="22">
      <rect height="12" rx="2" stroke="currentColor" strokeWidth="1.8" width="12" x="8" y="8" />
      <path
        d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg fill="none" height="22" viewBox="0 0 24 24" width="22">
      <path
        d="M5 19h4l10-10-4-4L5 15v4Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path d="m13.5 6.5 4 4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg fill="none" height="22" viewBox="0 0 24 24" width="22">
      <path
        d="M5 7h14M9 7V4h6v3m-8 0 1 13h8l1-13"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path d="M10 11v5m4-5v5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}
