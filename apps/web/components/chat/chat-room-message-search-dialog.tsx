"use client";

import Image from "next/image";
import { forwardRef, useId, type FormEvent, type KeyboardEvent } from "react";
import {
  ROOM_MESSAGE_SEARCH_RAW_QUERY_MAX_UTF16_CODE_UNITS,
  type ChatMessage,
} from "@/lib/chat/chat-room-contracts";
import { createRoomMessageSearchErrorPresentation } from "@/lib/chat/chat-room-message-search-error-presentation";

const SEARCH_SECONDARY_BUTTON_CLASS_NAME =
  "inline-flex min-h-11 items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-border)] bg-white px-4 text-sm font-bold text-[var(--chat-publishing-color-text)] transition hover:bg-[var(--chat-publishing-color-neutral-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)] disabled:cursor-not-allowed disabled:opacity-50";
const SEARCH_HEADER_ACTION_CLASS_NAME =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[var(--chat-publishing-radius-control)] px-1 text-sm font-bold text-[var(--chat-publishing-color-primary-emphasis)] transition hover:bg-[var(--chat-publishing-color-accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]";
const SEARCH_NAVIGATION_BUTTON_CLASS_NAME =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-xl font-bold text-[var(--chat-publishing-color-text)] transition hover:bg-[var(--chat-publishing-color-accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)] disabled:cursor-not-allowed disabled:opacity-35";

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
  messages: readonly ChatMessage[];
  rateLimitRetryAfterMs: number | undefined;
  retry: () => Promise<void>;
  setDraftQuery: (value: string) => void;
  startComposition: () => void;
  validationMessage: string | undefined;
}>;

export type ChatRoomMessageSearchNavigationController = Readonly<{
  canNavigateNewer: boolean;
  canNavigateOlder: boolean;
  currentResultIndex: number | null;
  isSeekingOlderResult: boolean;
  navigateToNewerResult: () => void;
  navigateToOlderResult: () => void;
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
  navigation,
  onClose,
}: Readonly<{
  controller: ChatRoomMessageSearchPanelController;
  navigation: ChatRoomMessageSearchNavigationController;
  onClose: () => void;
}>) {
  const titleId = useId();
  const helpId = useId();
  const inputId = useId();
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
      <header className="flex h-16 shrink-0 items-center gap-1.5 px-3">
        <h2 className="sr-only" id={titleId}>
          메시지 검색
        </h2>
        <form
          aria-label="토론방 메시지 검색"
          className="min-w-0 flex-1"
          onSubmit={handleSubmit}
          role="search"
        >
          <label className="sr-only" htmlFor={inputId}>
            메시지 내용
          </label>
          <div className="flex h-11 min-w-0 items-center gap-2 rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-border)] bg-white px-3 transition focus-within:border-[var(--chat-publishing-color-primary)] focus-within:ring-2 focus-within:ring-[var(--chat-publishing-color-accent-soft)]">
            <Image alt="" aria-hidden height={20} src="/assets/chat/search.png" width={20} />
            <input
              aria-describedby={describedBy}
              aria-invalid={controller.validationMessage ? true : undefined}
              autoComplete="off"
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-base text-[var(--chat-publishing-color-text)] outline-none placeholder:text-[var(--chat-publishing-color-muted)]"
              disabled={searchErrorPresentation?.terminal}
              id={inputId}
              inputMode="search"
              maxLength={ROOM_MESSAGE_SEARCH_RAW_QUERY_MAX_UTF16_CODE_UNITS}
              onChange={(event) => controller.setDraftQuery(event.currentTarget.value)}
              onCompositionEnd={controller.endComposition}
              onCompositionStart={controller.startComposition}
              placeholder="메시지 검색"
              type="search"
              value={controller.draftQuery}
            />
            {controller.appliedQuery !== undefined || controller.draftQuery ? (
              <button
                aria-label="검색 초기화"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--chat-publishing-color-neutral-soft)] text-base font-bold leading-none text-[var(--chat-publishing-color-muted)] transition hover:text-[var(--chat-publishing-color-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
                onClick={controller.clearSearch}
                type="button"
              >
                <span aria-hidden>×</span>
              </button>
            ) : null}
          </div>
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

        {controller.appliedQuery !== undefined ? (
          <SearchResultNavigation controller={controller} navigation={navigation} />
        ) : null}

        <button
          aria-label="메시지 검색 닫기"
          className={SEARCH_HEADER_ACTION_CLASS_NAME}
          onClick={onClose}
          type="button"
        >
          닫기
        </button>
      </header>

      <p className="sr-only" id={helpId}>
        검색어를 입력한 뒤 키보드의 검색 또는 Enter를 누르면 현재 접근 가능한 메시지 본문에서
        찾습니다.
      </p>

      {controller.validationMessage ? (
        <p
          className="mx-3 mb-3 rounded-[var(--chat-publishing-radius-control)] border border-[#ffc95c] bg-[#fff7e8] px-3 py-2.5 text-sm font-semibold leading-5 text-[#7a4b00]"
          data-chat-form-feedback="validation-error"
          id={validationId}
          role="alert"
        >
          {controller.validationMessage}
        </p>
      ) : null}

      {controller.isError ? (
        <div
          className="mx-3 mb-3 rounded-[var(--chat-publishing-radius-card)] border border-[#ffc95c] bg-[#fff7e8] p-3 text-[var(--chat-publishing-color-text)]"
          data-chat-form-feedback="request-error"
          role="alert"
        >
          <p className="text-sm font-semibold">{searchErrorPresentation?.title}</p>
          <p className="mt-1 text-xs leading-5 text-[#7a4b00]">{searchErrorPresentation?.detail}</p>
          {controller.rateLimitRetryAfterMs === undefined && searchErrorPresentation?.canRetry ? (
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
    </section>
  );
}

function SearchResultNavigation({
  controller,
  navigation,
}: Readonly<{
  controller: ChatRoomMessageSearchPanelController;
  navigation: ChatRoomMessageSearchNavigationController;
}>) {
  const loadedCount = controller.messages.length;
  const currentPosition =
    navigation.currentResultIndex === null ? 0 : navigation.currentResultIndex + 1;
  const isSearchingWithoutResults =
    loadedCount === 0 &&
    (controller.isPending || controller.isFetching || controller.hasNextPage) &&
    !controller.isError;
  const countLabel = isSearchingWithoutResults
    ? "검색 중…"
    : `${currentPosition} / ${loadedCount}${controller.hasNextPage ? "+" : ""}`;

  return (
    <div
      aria-busy={controller.isFetchingNextPage || navigation.isSeekingOlderResult}
      aria-label="메시지 검색 결과 이동"
      className="flex shrink-0 items-center gap-0.5"
    >
      <output
        aria-live="polite"
        className="min-w-12 whitespace-nowrap text-center text-xs font-bold tabular-nums text-[var(--chat-publishing-color-muted)]"
      >
        {countLabel}
      </output>
      <button
        aria-label="더 오래된 검색 결과"
        className={SEARCH_NAVIGATION_BUTTON_CLASS_NAME}
        disabled={!navigation.canNavigateOlder || navigation.isSeekingOlderResult}
        onClick={navigation.navigateToOlderResult}
        type="button"
      >
        <span aria-hidden>↑</span>
      </button>
      <button
        aria-label="더 최신 검색 결과"
        className={SEARCH_NAVIGATION_BUTTON_CLASS_NAME}
        disabled={!navigation.canNavigateNewer || navigation.isSeekingOlderResult}
        onClick={navigation.navigateToNewerResult}
        type="button"
      >
        <span aria-hidden>↓</span>
      </button>
    </div>
  );
}
