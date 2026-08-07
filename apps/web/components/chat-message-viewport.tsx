"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { createChatMessageArrivalAnnouncement } from "@/components/chat-message-arrival-announcement";
import { ChatMessageDateSeparator } from "@/components/chat-message-date-separator";
import { canReportChatMessageReadState } from "@/components/chat-message-read-state-policy";
import { ChatMessageItem } from "@/components/chat-message-item";
import {
  type ChatMessageAppendSource,
  type ChatMessageViewportPosition,
  createChatMessageViewportState,
  reduceChatMessageViewportState,
  shouldFollowLatestMessages,
} from "@/components/chat-message-viewport-state";
import type {
  ChatMessageItemViewModel,
  ChatMessageViewportItemViewModel,
} from "@/components/chat-room-view-model";

const AT_END_THRESHOLD = 96;
const ESTIMATED_DATE_SEPARATOR_HEIGHT = 24;
const ESTIMATED_MESSAGE_HEIGHT = 76;
const MESSAGE_GAP = 20;
const MESSAGE_OVERSCAN = 10;
const LATEST_SCROLL_SETTLE_FRAMES = 4;
const TOP_LOAD_THRESHOLD = 120;

export type ChatMessageViewportFeedback =
  | Readonly<{
      kind: "notice";
      message: string;
    }>
  | Readonly<{
      kind: "error";
      message: string;
      title: string;
    }>;

export type ChatMessageViewportViewModel = Readonly<{
  canLoadOlder: boolean;
  feedback: ChatMessageViewportFeedback | null;
  isLoadingOlder: boolean;
  items: readonly ChatMessageViewportItemViewModel[];
  latestConfirmedSequence: number | null;
  onLoadOlder: () => Promise<ChatMessageViewportLoadOlderResult>;
  onOpenMessageActions: (item: ChatMessageItemViewModel, trigger: HTMLButtonElement) => void;
  onReadThroughSequence: (throughSequence: number) => void;
  onRetry: () => void;
  readStateEnabled: boolean;
  readStatePaused: boolean;
  roomLabel: string;
  viewportKey: string;
}>;

export type ChatMessageViewportLoadOlderResult = Readonly<{
  hasOlderMessages: boolean;
}>;

export function ChatMessageViewport({ history }: { history: ChatMessageViewportViewModel }) {
  const {
    canLoadOlder,
    isLoadingOlder: isHistoryLoadingOlder,
    latestConfirmedSequence,
    onLoadOlder,
    onReadThroughSequence,
    readStateEnabled,
    readStatePaused,
    viewportKey,
  } = history;
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const previousItemsRef = useRef<ChatMessageViewportItemsSnapshot | null>(null);
  const pendingAnchorRef = useRef<ChatMessageViewportAnchor | null>(null);
  const olderRequestInFlightRef = useRef(false);
  const currentViewportKeyRef = useRef(history.viewportKey);
  const viewportPositionRef = useRef<ChatMessageViewportPosition>("initializing");
  const latestScrollFramesRef = useRef<ChatMessageViewportScrollFrames>({
    scroll: null,
    settle: null,
  });
  const arrivalAnnouncementSequenceRef = useRef(0);
  const [olderLoadError, setOlderLoadError] = useState<string | null>(null);
  const [arrivalAnnouncement, setArrivalAnnouncement] =
    useState<ChatMessageArrivalAnnouncement | null>(null);
  const [viewportState, dispatch] = useReducer(
    reduceChatMessageViewportState,
    canLoadOlder,
    createChatMessageViewportState,
  );
  // TanStack Virtual owns a mutable measurement engine; React Compiler must not memoize this hook.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: history.items.length,
    estimateSize: (index) =>
      history.items[index]?.kind === "date-separator"
        ? ESTIMATED_DATE_SEPARATOR_HEIGHT
        : ESTIMATED_MESSAGE_HEIGHT,
    gap: MESSAGE_GAP,
    getItemKey: (index) => history.items[index]?.renderKey ?? index,
    getScrollElement: () => scrollElementRef.current,
    overscan: MESSAGE_OVERSCAN,
    useFlushSync: false,
  });
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;
  const virtualItems = virtualizer.getVirtualItems();
  currentViewportKeyRef.current = viewportKey;

  const reportVisibleReadSequence = useCallback(() => {
    if (latestConfirmedSequence === null) {
      return;
    }

    const scrollElement = scrollElementRef.current;

    if (
      !canReportChatMessageReadState({
        documentHasFocus: document.hasFocus(),
        documentVisibilityState: document.visibilityState,
        isLatestSequenceVisible:
          scrollElement !== null && isSequenceVisible(scrollElement, latestConfirmedSequence),
        readStateEnabled,
        readStatePaused,
        viewportPosition: viewportPositionRef.current,
      })
    ) {
      return;
    }

    onReadThroughSequence(latestConfirmedSequence);
  }, [latestConfirmedSequence, onReadThroughSequence, readStateEnabled, readStatePaused]);

  const cancelLatestScroll = useCallback(() => {
    const frames = latestScrollFramesRef.current;

    if (frames.scroll !== null) {
      cancelAnimationFrame(frames.scroll);
    }

    if (frames.settle !== null) {
      cancelAnimationFrame(frames.settle);
    }

    latestScrollFramesRef.current = {
      scroll: null,
      settle: null,
    };
  }, []);

  const scrollToLatest = useCallback(() => {
    const latestIndex = history.items.length - 1;

    if (latestIndex < 0) {
      return;
    }

    cancelLatestScroll();
    latestScrollFramesRef.current.scroll = requestAnimationFrame(() => {
      latestScrollFramesRef.current.scroll = null;
      virtualizerRef.current.scrollToIndex(latestIndex, {
        align: "end",
      });

      const settleAtLatest = (remainingFrames: number) => {
        latestScrollFramesRef.current.settle = requestAnimationFrame(() => {
          latestScrollFramesRef.current.settle = null;
          const scrollElement = scrollElementRef.current;

          if (!scrollElement) {
            return;
          }

          scrollElement.scrollTop = scrollElement.scrollHeight;

          if (remainingFrames > 1) {
            settleAtLatest(remainingFrames - 1);
            return;
          }

          viewportPositionRef.current = "pinned";
          dispatch({
            type: "viewport-ready",
            isAtEnd: true,
          });
          reportVisibleReadSequence();
        });
      };

      settleAtLatest(LATEST_SCROLL_SETTLE_FRAMES);
    });
  }, [cancelLatestScroll, history.items.length, reportVisibleReadSequence]);

  const loadOlderMessages = useCallback(async () => {
    if (
      olderRequestInFlightRef.current ||
      !canLoadOlder ||
      isHistoryLoadingOlder ||
      viewportState.olderHistory === "loading" ||
      viewportState.olderHistory === "exhausted"
    ) {
      return;
    }

    const scrollElement = scrollElementRef.current;
    const anchor = scrollElement ? captureViewportAnchor(scrollElement) : null;

    if (!anchor) {
      return;
    }

    const requestViewportKey = viewportKey;
    olderRequestInFlightRef.current = true;
    pendingAnchorRef.current = anchor;
    setOlderLoadError(null);
    dispatch({ type: "load-older-started" });

    try {
      const result = await onLoadOlder();

      if (currentViewportKeyRef.current !== requestViewportKey) {
        return;
      }

      dispatch({
        type: "load-older-succeeded",
        hasOlderMessages: result.hasOlderMessages,
      });
    } catch (error) {
      if (currentViewportKeyRef.current !== requestViewportKey) {
        return;
      }

      pendingAnchorRef.current = null;
      setOlderLoadError(toErrorMessage(error));
      dispatch({ type: "load-older-failed" });
    } finally {
      if (currentViewportKeyRef.current === requestViewportKey) {
        olderRequestInFlightRef.current = false;
      }
    }
  }, [canLoadOlder, isHistoryLoadingOlder, onLoadOlder, viewportKey, viewportState.olderHistory]);

  useEffect(() => {
    dispatch({
      type: "older-availability-changed",
      hasOlderMessages: canLoadOlder,
    });
  }, [canLoadOlder]);

  useEffect(() => {
    olderRequestInFlightRef.current = false;
    pendingAnchorRef.current = null;
    setOlderLoadError(null);
    setArrivalAnnouncement(null);
    cancelLatestScroll();
  }, [cancelLatestScroll, viewportKey]);

  useEffect(() => {
    const recheckReadState = () => reportVisibleReadSequence();
    document.addEventListener("visibilitychange", recheckReadState);
    window.addEventListener("focus", recheckReadState);
    return () => {
      document.removeEventListener("visibilitychange", recheckReadState);
      window.removeEventListener("focus", recheckReadState);
    };
  }, [reportVisibleReadSequence]);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    let resizeFrame: number | null = null;

    const restoreLatestAfterResize = () => {
      if (viewportPositionRef.current !== "pinned") {
        return;
      }

      if (resizeFrame !== null) {
        cancelAnimationFrame(resizeFrame);
      }

      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        scrollToLatest();
      });
    };

    window.addEventListener("resize", restoreLatestAfterResize);
    visualViewport?.addEventListener("resize", restoreLatestAfterResize);
    visualViewport?.addEventListener("scroll", restoreLatestAfterResize);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(restoreLatestAfterResize);
    const scrollElement = scrollElementRef.current;

    if (scrollElement) {
      resizeObserver?.observe(scrollElement);
    }

    return () => {
      window.removeEventListener("resize", restoreLatestAfterResize);
      visualViewport?.removeEventListener("resize", restoreLatestAfterResize);
      visualViewport?.removeEventListener("scroll", restoreLatestAfterResize);
      resizeObserver?.disconnect();

      if (resizeFrame !== null) {
        cancelAnimationFrame(resizeFrame);
      }
    };
  }, [scrollToLatest]);

  useEffect(() => {
    if (!history.readStateEnabled) {
      return;
    }

    if (history.items.length > 0 && viewportPositionRef.current === "initializing") {
      scrollToLatest();
      return;
    }

    const frame = requestAnimationFrame(reportVisibleReadSequence);
    return () => cancelAnimationFrame(frame);
  }, [history.items, history.readStateEnabled, reportVisibleReadSequence, scrollToLatest]);

  useEffect(() => {
    const previous = previousItemsRef.current;
    const current = createItemsSnapshot(history.items, viewportKey);
    previousItemsRef.current = current;

    if (history.items.length === 0) {
      return;
    }

    const isNewViewport = previous?.viewportKey !== viewportKey;
    const isFirstPopulatedSnapshot = previous === null || previous.itemCount === 0;
    const previousLatestIndex =
      previous?.lastRenderKey === null
        ? -1
        : history.items.findIndex((item) => item.renderKey === previous?.lastRenderKey);
    const appendedItems =
      !isNewViewport && previousLatestIndex >= 0 && previousLatestIndex < history.items.length - 1
        ? history.items.slice(previousLatestIndex + 1)
        : [];
    const appendedMessages = appendedItems.flatMap((item) =>
      item.kind === "message" ? [item.item] : [],
    );
    const appendSource: ChatMessageAppendSource = appendedMessages.some(
      (item) => item.isMine && item.deliveryTone !== null,
    )
      ? "current-user"
      : "realtime";
    const shouldFollowLatest =
      isNewViewport ||
      isFirstPopulatedSnapshot ||
      (appendedMessages.length > 0 &&
        shouldFollowLatestMessages(viewportPositionRef.current, appendSource));

    if (isNewViewport) {
      viewportPositionRef.current = "initializing";
      dispatch({
        type: "reset",
        hasOlderMessages: canLoadOlder,
      });
    }

    if (appendedMessages.length > 0) {
      const announcedItems = appendedMessages.filter((item) => item.deliveryTone === null);
      const announcement = createChatMessageArrivalAnnouncement(announcedItems);

      if (announcement) {
        arrivalAnnouncementSequenceRef.current += 1;
        setArrivalAnnouncement({
          id: arrivalAnnouncementSequenceRef.current,
          message: announcement,
        });
      }

      if (appendSource === "current-user") {
        viewportPositionRef.current = "pinned";
      }

      dispatch({
        type: "messages-appended",
        count: appendedMessages.length,
        source: appendSource,
      });
    }

    if (!shouldFollowLatest) {
      return;
    }

    scrollToLatest();

    return cancelLatestScroll;
  }, [canLoadOlder, cancelLatestScroll, history.items, scrollToLatest, viewportKey]);

  useEffect(() => {
    const anchor = pendingAnchorRef.current;

    if (!anchor || anchor.viewportKey !== viewportKey) {
      return;
    }

    const anchorIndex = history.items.findIndex((item) => item.renderKey === anchor.renderKey);

    if (anchorIndex < 0) {
      return;
    }

    let settleAnimationFrame: number | null = null;
    const scrollAnimationFrame = requestAnimationFrame(() => {
      virtualizerRef.current.scrollToIndex(anchorIndex, {
        align: "start",
      });

      settleAnimationFrame = requestAnimationFrame(() => {
        const scrollElement = scrollElementRef.current;

        if (!scrollElement) {
          return;
        }

        const anchorElement = findRenderedAnchorElement(scrollElement, anchor.renderKey);

        if (!anchorElement) {
          return;
        }

        const currentOffset =
          anchorElement.getBoundingClientRect().top - scrollElement.getBoundingClientRect().top;
        scrollElement.scrollTop += currentOffset - anchor.offsetFromViewportTop;
        pendingAnchorRef.current = null;
      });
    });

    return () => {
      cancelAnimationFrame(scrollAnimationFrame);

      if (settleAnimationFrame !== null) {
        cancelAnimationFrame(settleAnimationFrame);
      }
    };
  }, [history.items, viewportKey]);

  function handleScroll() {
    const scrollElement = scrollElementRef.current;

    if (!scrollElement) {
      return;
    }

    const distanceFromEnd =
      scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight;
    const isAtEnd = distanceFromEnd <= AT_END_THRESHOLD;

    viewportPositionRef.current = isAtEnd ? "pinned" : "detached";
    dispatch({
      type: "scroll-position-changed",
      isAtEnd,
    });

    if (isAtEnd) {
      reportVisibleReadSequence();
    }

    if (scrollElement.scrollTop <= TOP_LOAD_THRESHOLD) {
      void loadOlderMessages();
    }
  }

  function handleJumpToLatest() {
    viewportPositionRef.current = "pinned";
    dispatch({ type: "jump-to-latest" });
    scrollToLatest();
  }

  const isLoadingOlder = isHistoryLoadingOlder || viewportState.olderHistory === "loading";

  return (
    <div className="relative flex h-[clamp(22rem,62dvh,42rem)] min-h-0 shrink flex-col bg-slate-50">
      {isLoadingOlder || olderLoadError ? (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-5">
          {olderLoadError ? (
            <div
              className="pointer-events-auto rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-red-950 shadow-sm"
              role="alert"
            >
              <p className="text-xs">{olderLoadError}</p>
              <button
                className="secondary-button mt-2"
                onClick={() => void loadOlderMessages()}
                type="button"
              >
                이전 메시지 다시 불러오기
              </button>
            </div>
          ) : (
            <p
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 shadow-sm"
              role="status"
            >
              이전 메시지를 불러오는 중…
            </p>
          )}
        </div>
      ) : null}

      {history.feedback?.kind === "error" ? (
        <div
          className="mx-5 mt-5 shrink-0 rounded-xl border border-red-200 bg-red-50 p-4 text-red-950"
          role="alert"
        >
          <p className="text-sm font-semibold">{history.feedback.title}</p>
          <p className="mt-1 text-xs opacity-80">{history.feedback.message}</p>
          <button className="secondary-button mt-3" onClick={history.onRetry} type="button">
            다시 불러오기
          </button>
        </div>
      ) : null}

      <p aria-atomic="true" aria-live="polite" aria-relevant="additions text" className="sr-only">
        {arrivalAnnouncement ? (
          <span key={arrivalAnnouncement.id}>{arrivalAnnouncement.message}</span>
        ) : null}
      </p>

      {viewportState.unseenMessageCount > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-5">
          <button
            aria-label={`새 메시지 ${viewportState.unseenMessageCount}개, 최신 메시지로 이동`}
            className="pointer-events-auto rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
            onClick={handleJumpToLatest}
            type="button"
          >
            새 메시지 {viewportState.unseenMessageCount}개 <span aria-hidden="true">↓</span>
          </button>
        </div>
      ) : null}

      <div
        aria-label={history.roomLabel}
        aria-live="off"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6"
        data-viewport-key={viewportKey}
        onScroll={handleScroll}
        ref={scrollElementRef}
        role="log"
        tabIndex={-1}
      >
        {history.feedback?.kind === "notice" ? (
          <MessageHistoryNotice message={history.feedback.message} />
        ) : null}

        {history.items.length > 0 ? (
          <ol
            className="relative w-full"
            style={{
              height: `${virtualizer.getTotalSize()}px`,
            }}
          >
            {virtualItems.map((virtualItem) => {
              const item = history.items[virtualItem.index];

              if (!item) {
                return null;
              }

              const style = {
                left: 0,
                position: "absolute" as const,
                top: 0,
                transform: `translateY(${virtualItem.start}px)`,
                width: "100%",
              };

              if (item.kind === "date-separator") {
                return (
                  <ChatMessageDateSeparator
                    date={item.date}
                    key={virtualItem.key}
                    ref={virtualizer.measureElement}
                    renderKey={item.renderKey}
                    style={style}
                    virtualIndex={virtualItem.index}
                  />
                );
              }

              return (
                <ChatMessageItem
                  item={item.item}
                  key={virtualItem.key}
                  onOpenActions={history.onOpenMessageActions}
                  ref={virtualizer.measureElement}
                  style={style}
                  virtualIndex={virtualItem.index}
                />
              );
            })}
          </ol>
        ) : null}
      </div>
    </div>
  );
}

type ChatMessageViewportItemsSnapshot = Readonly<{
  itemCount: number;
  lastRenderKey: string | null;
  viewportKey: string;
}>;

type ChatMessageArrivalAnnouncement = Readonly<{
  id: number;
  message: string;
}>;

type ChatMessageViewportScrollFrames = {
  scroll: number | null;
  settle: number | null;
};

type ChatMessageViewportAnchor = Readonly<{
  offsetFromViewportTop: number;
  renderKey: string;
  viewportKey: string;
}>;

function createItemsSnapshot(
  items: readonly ChatMessageViewportItemViewModel[],
  viewportKey: string,
): ChatMessageViewportItemsSnapshot {
  return {
    itemCount: items.length,
    lastRenderKey: items.at(-1)?.renderKey ?? null,
    viewportKey,
  };
}

function captureViewportAnchor(scrollElement: HTMLDivElement): ChatMessageViewportAnchor | null {
  const viewportBounds = scrollElement.getBoundingClientRect();
  const renderedItems = [...scrollElement.querySelectorAll<HTMLLIElement>("[data-render-key]")];
  const firstVisibleItem = renderedItems
    .filter((item) => item.getBoundingClientRect().bottom > viewportBounds.top)
    .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top)[0];
  const renderKey = firstVisibleItem?.dataset.renderKey;

  if (!firstVisibleItem || !renderKey) {
    return null;
  }

  return {
    offsetFromViewportTop: firstVisibleItem.getBoundingClientRect().top - viewportBounds.top,
    renderKey,
    viewportKey: currentViewportKeyFromElement(scrollElement),
  };
}

function findRenderedAnchorElement(
  scrollElement: HTMLDivElement,
  renderKey: string,
): HTMLLIElement | null {
  return (
    [...scrollElement.querySelectorAll<HTMLLIElement>("[data-render-key]")].find(
      (item) => item.dataset.renderKey === renderKey,
    ) ?? null
  );
}

function currentViewportKeyFromElement(scrollElement: HTMLDivElement): string {
  return scrollElement.dataset.viewportKey ?? "";
}

function isSequenceVisible(scrollElement: HTMLDivElement, roomSequence: number): boolean {
  const messageElement = scrollElement.querySelector<HTMLLIElement>(
    `[data-room-sequence="${roomSequence}"]`,
  );

  if (!messageElement) {
    return false;
  }

  const viewportBounds = scrollElement.getBoundingClientRect();
  const messageBounds = messageElement.getBoundingClientRect();
  return messageBounds.bottom > viewportBounds.top && messageBounds.top < viewportBounds.bottom;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "이전 메시지를 불러오지 못했습니다.";
}

function MessageHistoryNotice({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[20rem] items-center justify-center">
      <p className="text-center text-sm text-slate-500">{message}</p>
    </div>
  );
}
