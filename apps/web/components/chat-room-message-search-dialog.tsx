"use client";

import { forwardRef, useId, type FormEvent, type KeyboardEvent } from "react";
import {
  ROOM_MESSAGE_SEARCH_RAW_QUERY_MAX_UTF16_CODE_UNITS,
  type ChatMessage,
} from "@/lib/chat/chat-room-contracts";
import { UNKNOWN_ROOM_PARTICIPANT_DISPLAY_NAME } from "@/lib/chat/chat-room-participant-profiles";

export type ChatRoomMessageSearchDialogController = Readonly<{
  appliedQuery: string | undefined;
  applySearch: () => void;
  clearSearch: () => void;
  draftQuery: string;
  endComposition: () => void;
  error: unknown;
  hasNextPage: boolean;
  isComposing: boolean;
  isError: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isPending: boolean;
  loadMore: () => Promise<void>;
  messages: readonly ChatMessage[];
  rateLimitRetryAfterMs: number | undefined;
  retry: () => Promise<void>;
  setDraftQuery: (value: string) => void;
  startComposition: () => void;
  validationMessage: string | undefined;
}>;

export const ChatRoomMessageSearchDialogTrigger = forwardRef<
  HTMLButtonElement,
  Readonly<{
    disabled?: boolean;
    isOpen: boolean;
    onOpen: () => void;
  }>
>(function ChatRoomMessageSearchDialogTrigger({ disabled = false, isOpen, onOpen }, ref) {
  return (
    <button
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      className="secondary-button shrink-0"
      disabled={disabled}
      onClick={onOpen}
      ref={ref}
      type="button"
    >
      메시지 검색
    </button>
  );
});

export function ChatRoomMessageSearchDialog({
  controller,
  onClose,
  participantDisplayNames,
}: Readonly<{
  controller: ChatRoomMessageSearchDialogController;
  onClose: () => void;
  participantDisplayNames: ReadonlyMap<string, string>;
}>) {
  const titleId = useId();
  const helpId = useId();
  const validationId = useId();
  const describedBy = [helpId, controller.validationMessage ? validationId : undefined]
    .filter(Boolean)
    .join(" ");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    controller.applySearch();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
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
      className="relative flex size-full items-center justify-center p-3 sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white text-slate-950 shadow-2xl"
        data-chat-room-message-search-dialog="true"
        onKeyDown={handleKeyDown}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
          <div>
            <p className="eyebrow">Room messages</p>
            <h2 id={titleId}>메시지 검색</h2>
          </div>
          <button
            aria-label="메시지 검색 닫기"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-lg text-slate-600 transition hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <form
          aria-label="채팅방 메시지 검색"
          className="grid gap-3 border-b border-slate-200 p-4 sm:p-6"
          onSubmit={handleSubmit}
          role="search"
        >
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-700">
              메시지 내용
              <input
                aria-describedby={describedBy}
                aria-invalid={controller.validationMessage ? true : undefined}
                autoComplete="off"
                autoFocus
                className="min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                inputMode="search"
                maxLength={ROOM_MESSAGE_SEARCH_RAW_QUERY_MAX_UTF16_CODE_UNITS}
                onChange={(event) => controller.setDraftQuery(event.currentTarget.value)}
                onCompositionEnd={controller.endComposition}
                onCompositionStart={controller.startComposition}
                placeholder="두 글자 이상 입력해 주세요"
                type="search"
                value={controller.draftQuery}
              />
            </label>
            <button
              className="primary-button sm:min-w-24"
              disabled={controller.isComposing || controller.isFetching}
              type="submit"
            >
              {controller.isFetching && !controller.isFetchingNextPage ? "검색 중…" : "검색"}
            </button>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-xs text-slate-500" id={helpId}>
              검색 버튼을 누르면 현재 접근 가능한 메시지 본문에서 찾습니다.
            </p>
            {controller.appliedQuery !== undefined || controller.draftQuery ? (
              <button
                className="text-xs font-semibold text-slate-600 underline"
                onClick={controller.clearSearch}
                type="button"
              >
                검색 초기화
              </button>
            ) : null}
          </div>
          {controller.validationMessage ? (
            <p className="text-sm font-medium text-red-700" id={validationId} role="alert">
              {controller.validationMessage}
            </p>
          ) : null}
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <SearchResults
            controller={controller}
            participantDisplayNames={participantDisplayNames}
          />
        </div>
      </section>
    </div>
  );
}

function SearchResults({
  controller,
  participantDisplayNames,
}: Readonly<{
  controller: ChatRoomMessageSearchDialogController;
  participantDisplayNames: ReadonlyMap<string, string>;
}>) {
  if (controller.appliedQuery === undefined) {
    return <SearchNotice>검색어를 입력하고 검색 버튼을 눌러 주세요.</SearchNotice>;
  }

  if (controller.isPending && controller.messages.length === 0) {
    return <SearchNotice>메시지를 검색하고 있습니다.</SearchNotice>;
  }

  const hasResults = controller.messages.length > 0;
  const retryScheduled = controller.rateLimitRetryAfterMs !== undefined;

  return (
    <div className="grid gap-4" aria-live="polite">
      <p className="text-sm text-slate-600">
        <span className="font-semibold text-slate-900">“{controller.appliedQuery}”</span> 검색 결과
      </p>

      {hasResults ? (
        <ol aria-label="메시지 검색 결과" className="grid gap-3">
          {controller.messages.map((message) => (
            <li key={message.messageId}>
              <article
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                data-message-id={message.messageId}
                data-room-sequence={message.roomSequence}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">
                    {participantDisplayNames.get(message.senderMembershipId) ??
                      UNKNOWN_ROOM_PARTICIPANT_DISPLAY_NAME}
                  </span>
                  <time dateTime={message.createdAt}>
                    {formatSearchResultTime(message.createdAt)}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-900">
                  {message.content}
                </p>
              </article>
            </li>
          ))}
        </ol>
      ) : controller.isFetching ? (
        <SearchNotice>메시지를 검색하고 있습니다.</SearchNotice>
      ) : controller.hasNextPage && !controller.isError ? (
        <SearchNotice>
          이번 검색 구간에는 일치하는 메시지가 없습니다. 더 오래된 범위를 확인할 수 있습니다.
        </SearchNotice>
      ) : !controller.isError ? (
        <SearchNotice>검색 결과가 없습니다.</SearchNotice>
      ) : null}

      {controller.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-950" role="alert">
          <p className="text-sm font-semibold">
            {retryScheduled
              ? "검색 요청이 몰려 잠시 후 자동으로 다시 시도합니다."
              : "메시지 검색에 실패했습니다."}
          </p>
          <p className="mt-1 text-xs opacity-80">{toErrorMessage(controller.error)}</p>
          {!retryScheduled ? (
            <button
              className="secondary-button mt-3"
              onClick={() => void controller.retry()}
              type="button"
            >
              다시 시도
            </button>
          ) : null}
        </div>
      ) : null}

      {controller.hasNextPage ? (
        <button
          className="secondary-button justify-self-center"
          disabled={controller.isFetchingNextPage || retryScheduled}
          onClick={() => void controller.loadMore()}
          type="button"
        >
          {controller.isFetchingNextPage ? "더 검색하는 중…" : "더 오래된 메시지 검색"}
        </button>
      ) : null}
    </div>
  );
}

function SearchNotice({ children }: Readonly<{ children: string }>) {
  return (
    <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-600">
      {children}
    </p>
  );
}

function formatSearchResultTime(instant: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(instant));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
