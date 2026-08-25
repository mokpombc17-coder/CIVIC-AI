"use client";

import { forwardRef, useEffect, useId, useRef, type FormEvent, type KeyboardEvent } from "react";
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
      className="inline-flex h-9 shrink-0 items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-border)] bg-white px-2.5 text-xs font-bold text-[var(--chat-publishing-color-primary-emphasis)] transition hover:bg-[var(--chat-publishing-color-accent-soft)] disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onOpen}
      ref={ref}
      type="button"
    >
      검색
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

        {context.selectedMessageId === null ? (
          <>
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
                  className="primary-button sm:min-w-24"
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
      <p className="text-sm text-slate-600">
        <span className="font-semibold text-slate-900">“{controller.appliedQuery}”</span> 검색 결과
      </p>

      {hasResults ? (
        <ol aria-label="메시지 검색 결과" className="grid gap-3">
          {controller.messages.map((message) => (
            <li key={message.messageId}>
              <button
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                data-message-id={message.messageId}
                data-room-sequence={message.roomSequence}
                disabled={searchTerminated}
                onClick={() => onSelectMessage(message.messageId)}
                type="button"
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
                <span className="mt-3 block text-xs font-semibold text-blue-700">
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
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-950" role="alert">
          <p className="text-sm font-semibold">{errorPresentation?.title}</p>
          <p className="mt-1 text-xs opacity-80">{errorPresentation?.detail}</p>
          {!retryScheduled && errorPresentation?.canRetry ? (
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

      {controller.hasNextPage && !controller.isError ? (
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
        <div>
          <p className="text-sm font-semibold text-slate-900">검색 메시지 주변 대화</p>
          {context.targetRoomSequence !== null ? (
            <p className="text-xs text-slate-500">메시지 순서 {context.targetRoomSequence}</p>
          ) : null}
        </div>
        <button className="secondary-button" onClick={context.closeContext} type="button">
          검색 결과로 돌아가기
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {context.isPending ? (
          <SearchNotice>주변 대화를 불러오고 있습니다.</SearchNotice>
        ) : context.isError && context.messages.length === 0 ? (
          <ContextFailure context={context} />
        ) : (
          <div className="grid gap-3">
            {context.hasOlder ? (
              <button
                className="secondary-button justify-self-center"
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
                        ? "rounded-xl border-2 border-blue-500 bg-blue-50 p-4 outline-none ring-4 ring-blue-100"
                        : "rounded-xl border border-slate-200 bg-white p-4 outline-none"
                    }
                    data-context-target={isTarget ? "true" : undefined}
                    data-message-id={message.messageId}
                    data-room-sequence={message.roomSequence}
                    key={message.messageId}
                    ref={isTarget ? targetRef : undefined}
                    tabIndex={isTarget ? -1 : undefined}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">
                        {participantDisplayNames.get(message.senderMembershipId) ??
                          UNKNOWN_ROOM_PARTICIPANT_DISPLAY_NAME}
                      </span>
                      <div className="flex items-center gap-2">
                        {isTarget ? (
                          <span className="rounded-full bg-blue-600 px-2 py-0.5 font-semibold text-white">
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
                          ? "mt-2 text-sm italic text-slate-500"
                          : "mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-900"
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
                className="secondary-button justify-self-center"
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
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-950" role="alert">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs opacity-80">{presentation.detail}</p>
      {presentation.canRetry ? (
        <button
          className="secondary-button mt-3"
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
