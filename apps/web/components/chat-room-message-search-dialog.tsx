"use client";

import Image from "next/image";
import { forwardRef, useEffect, useId, useRef, type FormEvent, type KeyboardEvent } from "react";
import { PlatformHeader } from "@/components/platform-shell";
import type { RoomMessageContextDirection } from "@/components/use-room-message-context";
import {
  ROOM_MESSAGE_SEARCH_RAW_QUERY_MAX_UTF16_CODE_UNITS,
  type ChatMessage,
} from "@/lib/chat/chat-room-contracts";
import {
  createRoomMessageContextErrorPresentation,
  createRoomMessageSearchErrorPresentation,
} from "@/lib/chat/chat-room-message-search-error-presentation";
import { UNKNOWN_ROOM_PARTICIPANT_DISPLAY_NAME } from "@/lib/chat/chat-room-participant-profiles";

const SEARCH_PRIMARY_BUTTON_CLASS_NAME =
  "inline-flex h-12 items-center justify-center rounded-[var(--chat-publishing-radius-control)] bg-[var(--chat-publishing-color-primary)] px-4 text-sm font-bold text-white transition hover:bg-[var(--chat-publishing-color-primary-emphasis)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)] disabled:cursor-not-allowed disabled:opacity-50";
const SEARCH_SECONDARY_BUTTON_CLASS_NAME =
  "inline-flex min-h-11 items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-border)] bg-white px-4 text-sm font-bold text-[var(--chat-publishing-color-text)] transition hover:bg-[var(--chat-publishing-color-neutral-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)] disabled:cursor-not-allowed disabled:opacity-50";

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

export type ChatRoomMessageContextDialogController = Readonly<{
  closeContext: () => void;
  error: unknown | null;
  failedDirection: RoomMessageContextDirection | null;
  hasNewer: boolean;
  hasOlder: boolean;
  isError: boolean;
  isLoadingNewer: boolean;
  isLoadingOlder: boolean;
  isPending: boolean;
  loadNewer: () => Promise<void>;
  loadOlder: () => Promise<void>;
  messages: readonly ChatMessage[];
  openContext: (messageId: string) => void;
  retry: () => Promise<void>;
  selectedMessageId: string | null;
  targetMessageId: string | null;
  targetRoomSequence: number | null;
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

export function ChatRoomMessageSearchDialog({
  context,
  controller,
  onClose,
  participantDisplayNames,
}: Readonly<{
  context: ChatRoomMessageContextDialogController;
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
  const searchErrorPresentation = controller.isError
    ? createRoomMessageSearchErrorPresentation(controller.error)
    : null;
  const isContextOpen = context.selectedMessageId !== null;

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
    <div className="relative flex size-full bg-white">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="flex size-full min-h-0 flex-col overflow-hidden bg-white text-[var(--chat-publishing-color-text)]"
        data-chat-room-message-search-dialog="true"
        data-presentation="full-height"
        onKeyDown={handleKeyDown}
        role="dialog"
      >
        <PlatformHeader
          backAction={{
            ariaLabel: isContextOpen ? "검색 결과로 돌아가기" : "메시지 검색 닫기",
            onClick: isContextOpen ? context.closeContext : onClose,
          }}
          className="shrink-0"
          title={<span id={titleId}>{isContextOpen ? "주변 대화" : "메시지 검색"}</span>}
        />

        {!isContextOpen ? (
          <>
            <form
              aria-label="채팅방 메시지 검색"
              className="grid shrink-0 gap-2 border-b border-[var(--chat-publishing-color-border)] px-4 py-3"
              onSubmit={handleSubmit}
              role="search"
            >
              <div className="flex min-w-0 items-center gap-2">
                <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-border)] bg-white px-3 transition focus-within:border-[var(--chat-publishing-color-primary)] focus-within:ring-2 focus-within:ring-[var(--chat-publishing-color-accent-soft)]">
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
                    placeholder="두 글자 이상 입력해 주세요"
                    type="search"
                    value={controller.draftQuery}
                  />
                </label>
                <button
                  className={`${SEARCH_PRIMARY_BUTTON_CLASS_NAME} w-[72px] shrink-0 px-3`}
                  disabled={
                    controller.isComposing ||
                    controller.isFetching ||
                    searchErrorPresentation?.terminal
                  }
                  type="submit"
                >
                  {controller.isFetching && !controller.isFetchingNextPage ? "검색 중…" : "검색"}
                </button>
              </div>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p
                  className="text-xs leading-5 text-[var(--chat-publishing-color-muted)]"
                  id={helpId}
                >
                  검색 버튼을 누르면 현재 접근 가능한 메시지 본문에서 찾습니다.
                </p>
                {controller.appliedQuery !== undefined || controller.draftQuery ? (
                  <button
                    className="text-xs font-bold text-[var(--chat-publishing-color-primary-emphasis)] underline underline-offset-2"
                    onClick={controller.clearSearch}
                    type="button"
                  >
                    검색 초기화
                  </button>
                ) : null}
              </div>
              {controller.validationMessage ? (
                <p className="text-sm font-medium text-[#b42318]" id={validationId} role="alert">
                  {controller.validationMessage}
                </p>
              ) : null}
            </form>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              <SearchResults
                controller={controller}
                onSelectMessage={context.openContext}
                participantDisplayNames={participantDisplayNames}
              />
            </div>
          </>
        ) : (
          <MessageContextWindow
            context={context}
            participantDisplayNames={participantDisplayNames}
          />
        )}
      </section>
    </div>
  );
}

function SearchResults({
  controller,
  onSelectMessage,
  participantDisplayNames,
}: Readonly<{
  controller: ChatRoomMessageSearchDialogController;
  onSelectMessage: (messageId: string) => void;
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
                onClick={() => onSelectMessage(message.messageId)}
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
                  주변 대화 보기
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
          role="alert"
        >
          <p className="text-sm font-semibold">{errorPresentation?.title}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--chat-publishing-color-muted)]">
            {errorPresentation?.detail}
          </p>
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

function MessageContextWindow({
  context,
  participantDisplayNames,
}: Readonly<{
  context: ChatRoomMessageContextDialogController;
  participantDisplayNames: ReadonlyMap<string, string>;
}>) {
  const targetRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (context.targetMessageId === null || context.isPending || context.isError) {
      return;
    }

    const target = targetRef.current;

    requestAnimationFrame(() => {
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    });
  }, [context.isError, context.isPending, context.targetMessageId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {context.isPending ? (
          <SearchNotice>주변 대화를 불러오고 있습니다.</SearchNotice>
        ) : context.isError && context.messages.length === 0 ? (
          <ContextFailure context={context} />
        ) : (
          <div className="grid gap-3">
            {context.hasOlder ? (
              <button
                className={`${SEARCH_SECONDARY_BUTTON_CLASS_NAME} justify-self-center`}
                disabled={context.isLoadingOlder}
                onClick={() => void context.loadOlder()}
                type="button"
              >
                {context.isLoadingOlder ? "이전 대화 불러오는 중…" : "이전 대화 더 보기"}
              </button>
            ) : null}

            {context.isError && context.messages.length > 0 ? (
              <ContextFailure context={context} />
            ) : null}

            <ol aria-label="검색 메시지 주변 대화" className="grid gap-2">
              {context.messages.map((message) => {
                const isTarget = message.messageId === context.targetMessageId;

                return (
                  <li
                    aria-current={isTarget ? "true" : undefined}
                    className={
                      isTarget
                        ? "rounded-[var(--chat-publishing-radius-card)] border border-[var(--chat-publishing-color-primary)] bg-[var(--chat-publishing-color-accent-soft)] p-4 outline-none ring-2 ring-[var(--chat-publishing-color-accent-soft)]"
                        : "rounded-[var(--chat-publishing-radius-card)] border border-[var(--chat-publishing-color-border)] bg-white p-4 outline-none"
                    }
                    data-context-target={isTarget ? "true" : undefined}
                    data-message-id={message.messageId}
                    data-room-sequence={message.roomSequence}
                    key={message.messageId}
                    ref={isTarget ? targetRef : undefined}
                    tabIndex={isTarget ? -1 : undefined}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--chat-publishing-color-muted)]">
                      <span className="font-bold text-[var(--chat-publishing-color-text)]">
                        {participantDisplayNames.get(message.senderMembershipId) ??
                          UNKNOWN_ROOM_PARTICIPANT_DISPLAY_NAME}
                      </span>
                      <div className="flex items-center gap-2">
                        {isTarget ? (
                          <span className="rounded-full bg-[var(--chat-publishing-color-primary)] px-2 py-0.5 font-bold text-white">
                            검색한 메시지
                          </span>
                        ) : null}
                        <time dateTime={message.createdAt}>
                          {formatSearchResultTime(message.createdAt)}
                        </time>
                      </div>
                    </div>
                    <p
                      className={
                        message.state === "DELETED_BY_AUTHOR"
                          ? "mt-2 text-sm italic text-[var(--chat-publishing-color-muted)]"
                          : "mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--chat-publishing-color-text)]"
                      }
                    >
                      {message.content ?? "삭제된 메시지입니다."}
                    </p>
                  </li>
                );
              })}
            </ol>

            {context.hasNewer ? (
              <button
                className={`${SEARCH_SECONDARY_BUTTON_CLASS_NAME} justify-self-center`}
                disabled={context.isLoadingNewer}
                onClick={() => void context.loadNewer()}
                type="button"
              >
                {context.isLoadingNewer ? "이후 대화 불러오는 중…" : "이후 대화 더 보기"}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function ContextFailure({
  context,
}: Readonly<{ context: ChatRoomMessageContextDialogController }>) {
  const fallbackTitle =
    context.failedDirection === "older"
      ? "이전 대화를 더 불러오지 못했습니다."
      : context.failedDirection === "newer"
        ? "이후 대화를 더 불러오지 못했습니다."
        : "주변 대화를 불러오지 못했습니다.";
  const presentation = createRoomMessageContextErrorPresentation(context.error);
  const title =
    presentation.title === "주변 대화를 불러오지 못했습니다." ? fallbackTitle : presentation.title;

  return (
    <div
      className="rounded-[var(--chat-publishing-radius-card)] border border-[#ffc95c] bg-[#fff7e8] p-4 text-[var(--chat-publishing-color-text)]"
      role="alert"
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--chat-publishing-color-muted)]">
        {presentation.detail}
      </p>
      {presentation.canRetry ? (
        <button
          className={`${SEARCH_SECONDARY_BUTTON_CLASS_NAME} mt-3`}
          onClick={() => void context.retry()}
          type="button"
        >
          다시 시도
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
