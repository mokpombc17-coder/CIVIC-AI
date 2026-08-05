"use client";

import { useId, type KeyboardEvent } from "react";
import type { ChatMessageActionsBottomSheetViewModel } from "@/components/use-chat-message-actions-bottom-sheet";

export function ChatMessageActionsBottomSheet({
  sheet,
}: {
  sheet: ChatMessageActionsBottomSheetViewModel;
}) {
  const titleId = useId();
  const editInputId = useId();

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
        className="relative max-h-[calc(100%-1rem)] w-full overflow-y-auto rounded-t-2xl border border-b-0 border-slate-200 bg-white px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-slate-950 shadow-2xl sm:mx-4 sm:mb-4 sm:max-w-lg sm:rounded-2xl sm:border-b"
        data-chat-message-actions-sheet="true"
        onKeyDown={handleKeyDown}
        role="dialog"
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" />
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Message actions</p>
            <h2 className="text-lg font-bold" id={titleId}>
              메시지 작업
            </h2>
          </div>
          <button
            aria-label="메시지 작업 닫기"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-lg text-slate-600 transition hover:bg-slate-100"
            onClick={sheet.onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <p className="mt-4 line-clamp-3 whitespace-pre-wrap break-words rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
          {sheet.content}
        </p>

        {sheet.mode === "menu" ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              autoFocus
              className="secondary-button"
              disabled={sheet.isPending}
              onClick={() => sheet.onModeChange("edit")}
              type="button"
            >
              수정
            </button>
            <button
              className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={sheet.isPending}
              onClick={() => sheet.onModeChange("delete")}
              type="button"
            >
              삭제
            </button>
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
            <label className="text-xs font-semibold text-slate-700" htmlFor={editInputId}>
              메시지 수정
            </label>
            <textarea
              autoFocus
              className="mt-2 min-h-24 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm"
              disabled={sheet.isPending}
              id={editInputId}
              onChange={(event) => sheet.onDraftChange(event.target.value)}
              value={sheet.draft}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                className="secondary-button"
                disabled={sheet.isPending}
                onClick={() => sheet.onModeChange("menu")}
                type="button"
              >
                취소
              </button>
              <button className="primary-button" disabled={sheet.isPending} type="submit">
                {sheet.isPending ? "수정 중…" : "저장"}
              </button>
            </div>
          </form>
        ) : null}

        {sheet.mode === "delete" ? (
          <div className="mt-4">
            <p className="text-sm font-semibold">이 메시지를 삭제할까요?</p>
            <p className="mt-1 text-xs text-slate-500">
              메시지 위치는 유지되고 삭제된 메시지로 표시됩니다.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                autoFocus
                className="secondary-button"
                disabled={sheet.isPending}
                onClick={() => sheet.onModeChange("menu")}
                type="button"
              >
                취소
              </button>
              <button
                className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={sheet.isPending}
                onClick={sheet.onConfirmDelete}
                type="button"
              >
                {sheet.isPending ? "삭제 중…" : "삭제"}
              </button>
            </div>
          </div>
        ) : null}

        {sheet.error ? (
          <p className="mt-3 text-xs text-red-700" role="alert">
            {sheet.error}
          </p>
        ) : null}

        {sheet.isPending && sheet.isRetryWaiting ? (
          <p className="mt-3 text-xs text-slate-500" role="status">
            잠시 후 자동으로 다시 시도합니다.
          </p>
        ) : null}
      </section>
    </div>
  );
}
