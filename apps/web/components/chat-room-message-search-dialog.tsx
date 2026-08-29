"use client";

import Image from "next/image";
import { forwardRef, useId, type FormEvent, type KeyboardEvent } from "react";
import {
  ROOM_MESSAGE_SEARCH_RAW_QUERY_MAX_UTF16_CODE_UNITS,
  type ChatMessage,
} from "@/lib/chat/chat-room-contracts";
import { createRoomMessageSearchErrorPresentation } from "@/lib/chat/chat-room-message-search-error-presentation";
import { UNKNOWN_ROOM_PARTICIPANT_DISPLAY_NAME } from "@/lib/chat/chat-room-participant-profiles";

const SEARCH_SECONDARY_BUTTON_CLASS_NAME =
  "inline-flex min-h-11 items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-border)] bg-white px-4 text-sm font-bold text-[var(--chat-publishing-color-text)] transition hover:bg-[var(--chat-publishing-color-neutral-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)] disabled:cursor-not-allowed disabled:opacity-50";
const SEARCH_HEADER_ACTION_CLASS_NAME =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[var(--chat-publishing-radius-control)] px-1 text-sm font-bold text-[var(--chat-publishing-color-primary-emphasis)] transition hover:bg-[var(--chat-publishing-color-accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]";

export const CHAT_ROOM_MESSAGE_SEARCH_PANEL_ID = "chat-room-message-search-panel";

export type ChatRoomMessageSearchPanelController = Readonly<{
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

export const ChatRoomMessageSearchPanelTrigger = forwardRef<
  HTMLButtonElement,
  Readonly<{
    disabled?: boolean;
    isOpen: boolean;
    onOpen: () => void;
  }>
>(function ChatRoomMessageSearchPanelTrigger({ disabled = false, isOpen, onOpen }, ref) {
  return (
    <button
      aria-controls={CHAT_ROOM_MESSAGE_SEARCH_PANEL_ID}
      aria-expanded={isOpen}
      aria-label="메시지 검색"
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full transition hover:bg-[var(--chat-publishing-color-accent-soft)] disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onOpen}
      ref={ref}
      type="button"
    >
      <Image alt="" aria-hidden height={24} src="/assets/chat/search.png" width={24} />
    </button>
  );
});

export function ChatRoomMessageSearchPanel({
  controller,
  onClose,
  onNavigateToMessage,
  participantDisplayNames,
}: Readonly<{
  controller: ChatRoomMessageSearchPanelController;
  onClose: () => void;
  onNavigateToMessage: (messageId: string) => void;
  participantDisplayNames: ReadonlyMap<string, string>;
}>) {
  const titleId = useId();
  const helpId = useId();
  const validationId = useId();
  const describedBy = [helpId, controller.validationMessage ? validationId : undefined]
    .filter(Boolean)
    .join(" ");
  const searchErrorPresentation = controller.isError
    ? createRoomMessageSearchErrorPresentation(controller.error)
    : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    controller.applySearch();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <section
      aria-labelledby={titleId}
      className="shrink-0 overflow-hidden border-b border-[var(--chat-publishing-color-border)] bg-white text-[var(--chat-publishing-color-text)]"
      data-chat-room-message-search-panel="true"
      data-presentation="inline"
      id={CHAT_ROOM_MESSAGE_SEARCH_PANEL_ID}
      onKeyDown={handleKeyDown}
    >
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-[var(--chat-publishing-color-border)] bg-white px-4">
        <h2 className="sr-only" id={titleId}>
          메시지 검색
        </h2>
        <form
          aria-label="채팅방 메시지 검색"
          className="min-w-0 flex-1"
          onSubmit={handleSubmit}
          role="search"
        >
          <label className="flex h-11 min-w-0 items-center gap-2 rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-border)] bg-white px-3 transition focus-within:border-[var(--chat-publishing-color-primary)] focus-within:ring-2 focus-within:ring-[var(--chat-publishing-color-accent-soft)]">
            <span className="sr-only">메시지 내용</span>
            <Image alt="" aria-hidden height={20} src="/assets/chat/search.png" width={20} />
            <input
              aria-describedby={describedBy}
              aria-invalid={controller.validationMessage ? true : undefined}
              autoComplete="off"
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-base text-[var(--chat-publishing-color-text)] outline-none placeholder:text-[var(--chat-publishing-color-muted)]"
              disabled={searchErrorPresentation?.terminal}
              inputMode="search"
              maxLength={ROOM_MESSAGE_SEARCH_RAW_QUERY_MAX_UTF16_CODE_UNITS}
              onChange={(event) => controller.setDraftQuery(event.currentTarget.value)}
              onCompositionEnd={controller.endComposition}
              onCompositionStart={controller.startComposition}
              placeholder="메시지 검색"
              type="search"
              value={controller.draftQuery}
            />
          </label>
          <button
            className="sr-only"
            disabled={
              controller.isComposing || controller.isFetching || searchErrorPresentation?.terminal
            }
            tabIndex={-1}
            type="submit"
          >
            검색
          </button>
        </form>
        <button
          aria-label="메시지 검색 닫기"
          className={SEARCH_HEADER_ACTION_CLASS_NAME}
          onClick={onClose}
          type="button"
        >
          취소
        </button>
      </header>

      <p className="sr-only" id={helpId}>
        검색어를 입력한 뒤 키보드의 검색 또는 Enter를 누르면 현재 접근 가능한 메시지 본문에서
        찾습니다.
      </p>
      {controller.validationMessage ||
      controller.appliedQuery !== undefined ||
      controller.draftQuery ? (
        <div className="grid shrink-0 gap-2 border-b border-[var(--chat-publishing-color-border)] px-4 py-2.5">
          {controller.appliedQuery !== undefined || controller.draftQuery ? (
            <div className="flex justify-end">
              <button
                className="text-xs font-bold text-[var(--chat-publishing-color-primary-emphasis)] underline underline-offset-2"
                onClick={controller.clearSearch}
                type="button"
              >
                검색 초기화
              </button>
            </div>
          ) : null}
          {controller.validationMessage ? (
            <p
              className="rounded-[var(--chat-publishing-radius-control)] border border-[#ffc95c] bg-[#fff7e8] px-3 py-2.5 text-sm font-semibold leading-5 text-[#7a4b00]"
              data-chat-form-feedback="validation-error"
              id={validationId}
              role="alert"
            >
              {controller.validationMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      {controller.appliedQuery !== undefined ? (
        <div className="max-h-[min(240px,38dvh)] overflow-y-auto overscroll-contain px-4 py-3">
          <SearchResults
            controller={controller}
            onNavigateToMessage={onNavigateToMessage}
            participantDisplayNames={participantDisplayNames}
          />
        </div>
      ) : null}
    </section>
  );
}

function SearchResults({
  controller,
  onNavigateToMessage,
  participantDisplayNames,
}: Readonly<{
  controller: ChatRoomMessageSearchPanelController;
  onNavigateToMessage: (messageId: string) => void;
  participantDisplayNames: ReadonlyMap<string, string>;
}>) {
  if (controller.appliedQuery === undefined) {
    return <SearchNotice>검색어를 입력한 뒤 검색을 실행해 주세요.</SearchNotice>;
  }

  if (controller.isPending && controller.messages.length === 0) {
    return <SearchNotice>메시지를 검색하고 있습니다.</SearchNotice>;
  }

  const hasResults = controller.messages.length > 0;
  const retryScheduled = controller.rateLimitRetryAfterMs !== undefined;
  const errorPresentation = controller.isError
    ? createRoomMessageSearchErrorPresentation(controller.error)
    : null;
  const searchTerminated = errorPresentation?.terminal === true;

  return (
    <div className="grid gap-4" aria-live="polite">
      <p className="text-sm text-[var(--chat-publishing-color-muted)]">
        <span className="font-bold text-[var(--chat-publishing-color-text)]">
          “{controller.appliedQuery}”
        </span>{" "}
        검색 결과
      </p>

      {hasResults ? (
        <ol aria-label="메시지 검색 결과" className="grid gap-3">
          {controller.messages.map((message) => (
            <li key={message.messageId}>
              <button
                className="w-full rounded-[var(--chat-publishing-radius-card)] border border-[var(--chat-publishing-color-border)] bg-white p-4 text-left transition hover:border-[var(--chat-publishing-color-primary)] hover:bg-[var(--chat-publishing-color-accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                data-message-id={message.messageId}
                data-room-sequence={message.roomSequence}
                disabled={searchTerminated}
                onClick={() => onNavigateToMessage(message.messageId)}
                type="button"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--chat-publishing-color-muted)]">
                  <span className="font-bold text-[var(--chat-publishing-color-text)]">
                    {participantDisplayNames.get(message.senderMembershipId) ??
                      UNKNOWN_ROOM_PARTICIPANT_DISPLAY_NAME}
                  </span>
                  <time dateTime={message.createdAt}>
                    {formatSearchResultTime(message.createdAt)}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--chat-publishing-color-text)]">
                  {message.content}
                </p>
                <span className="mt-3 block text-xs font-bold text-[var(--chat-publishing-color-primary-emphasis)]">
                  이동 하기
                </span>
              </button>
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
        <div
          className="rounded-[var(--chat-publishing-radius-card)] border border-[#ffc95c] bg-[#fff7e8] p-4 text-[var(--chat-publishing-color-text)]"
          data-chat-form-feedback="request-error"
          role="alert"
        >
          <p className="text-sm font-semibold">{errorPresentation?.title}</p>
          <p className="mt-1 text-xs leading-5 text-[#7a4b00]">{errorPresentation?.detail}</p>
          {!retryScheduled && errorPresentation?.canRetry ? (
            <button
              className={`${SEARCH_SECONDARY_BUTTON_CLASS_NAME} mt-3`}
              onClick={() => void controller.retry()}
              type="button"
            >
              다시 시도
            </button>
          ) : null}
        </div>
      ) : null}

      {controller.hasNextPage && !controller.isError ? (
        <button
          className={`${SEARCH_SECONDARY_BUTTON_CLASS_NAME} justify-self-center`}
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
    <p className="rounded-[var(--chat-publishing-radius-card)] bg-[var(--chat-publishing-color-neutral-soft)] p-5 text-center text-sm leading-6 text-[var(--chat-publishing-color-muted)]">
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
