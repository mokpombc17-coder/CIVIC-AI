"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChatMessageItem } from "@/components/chat-message-item";
import {
  type ChatMessageAppendSource,
  type ChatMessageViewportPosition,
  createChatMessageViewportState,
  reduceChatMessageViewportState,
  shouldFollowLatestMessages,
} from "@/components/chat-message-viewport-state";
import type { ChatMessageItemViewModel } from "@/components/chat-room-view-model";

const AT_END_THRESHOLD = 96;
const ESTIMATED_MESSAGE_HEIGHT = 76;
const MESSAGE_GAP = 20;
const MESSAGE_OVERSCAN = 10;
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
  items: readonly ChatMessageItemViewModel[];
  onLoadOlder: () => Promise<ChatMessageViewportLoadOlderResult>;
  onRetry: () => void;
  roomLabel: string;
  viewportKey: string;
}>;

export type ChatMessageViewportLoadOlderResult = Readonly<{
  hasOlderMessages: boolean;
}>;

export function ChatMessageViewport({ history }: { history: ChatMessageViewportViewModel }) {
  const { canLoadOlder, isLoadingOlder: isHistoryLoadingOlder, onLoadOlder, viewportKey } = history;
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
  const [olderLoadError, setOlderLoadError] = useState<string | null>(null);
  const [viewportState, dispatch] = useReducer(
    reduceChatMessageViewportState,
    canLoadOlder,
    createChatMessageViewportState,
  );
  // TanStack Virtual owns a mutable measurement engine; React Compiler must not memoize this hook.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: history.items.length,
    estimateSize: () => ESTIMATED_MESSAGE_HEIGHT,
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

      latestScrollFramesRef.current.settle = requestAnimationFrame(() => {
        latestScrollFramesRef.current.settle = null;
        const scrollElement = scrollElementRef.current;

        if (!scrollElement) {
          return;
        }

        scrollElement.scrollTop = scrollElement.scrollHeight;
        viewportPositionRef.current = "pinned";
        dispatch({
          type: "viewport-ready",
          isAtEnd: true,
        });
      });
    });
  }, [cancelLatestScroll, history.items.length]);

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
    cancelLatestScroll();
  }, [cancelLatestScroll, viewportKey]);

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
    const appendSource: ChatMessageAppendSource = appendedItems.some(
      (item) => item.isMine && item.deliveryTone !== null,
    )
      ? "current-user"
      : "realtime";
    const shouldFollowLatest =
      isNewViewport ||
      isFirstPopulatedSnapshot ||
      (appendedItems.length > 0 &&
        shouldFollowLatestMessages(viewportPositionRef.current, appendSource));

    if (isNewViewport) {
      viewportPositionRef.current = "initializing";
      dispatch({
        type: "reset",
        hasOlderMessages: canLoadOlder,
      });
    }

    if (appendedItems.length > 0) {
      if (appendSource === "current-user") {
        viewportPositionRef.current = "pinned";
      }

      dispatch({
        type: "messages-appended",
        count: appendedItems.length,
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
    <div className="relative flex h-[clamp(22rem,62dvh,42rem)] min-h-0 flex-col bg-slate-50">
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
        aria-live="polite"
        aria-relevant="additions text"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6"
        data-viewport-key={viewportKey}
        onScroll={handleScroll}
        ref={scrollElementRef}
        role="log"
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

              return (
                <ChatMessageItem
                  item={item}
                  key={virtualItem.key}
                  ref={virtualizer.measureElement}
                  style={{
                    left: 0,
                    position: "absolute",
                    top: 0,
                    transform: `translateY(${virtualItem.start}px)`,
                    width: "100%",
                  }}
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
  items: readonly ChatMessageItemViewModel[],
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
