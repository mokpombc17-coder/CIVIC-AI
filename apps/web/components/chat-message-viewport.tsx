"use client";

import { useEffect, useReducer, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChatMessageItem } from "@/components/chat-message-item";
import {
  createChatMessageViewportState,
  reduceChatMessageViewportState,
} from "@/components/chat-message-viewport-state";
import type { ChatMessageItemViewModel } from "@/components/chat-room-view-model";

const AT_END_THRESHOLD = 96;
const ESTIMATED_MESSAGE_HEIGHT = 76;
const MESSAGE_GAP = 20;
const MESSAGE_OVERSCAN = 10;

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
  onLoadOlder: () => void;
  onRetry: () => void;
  roomLabel: string;
  viewportKey: string;
}>;

export function ChatMessageViewport({ history }: { history: ChatMessageViewportViewModel }) {
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const previousItemsRef = useRef<ChatMessageViewportItemsSnapshot | null>(null);
  const viewportPositionRef = useRef<"initializing" | "pinned" | "detached">("initializing");
  const [, dispatch] = useReducer(
    reduceChatMessageViewportState,
    history.canLoadOlder,
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
  });
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;
  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    const previous = previousItemsRef.current;
    const current = createItemsSnapshot(history.items, history.viewportKey);
    previousItemsRef.current = current;

    if (history.items.length === 0) {
      return;
    }

    const isNewViewport = previous?.viewportKey !== history.viewportKey;
    const isFirstPopulatedSnapshot = previous === null || previous.itemCount === 0;
    const previousLatestIndex =
      previous?.lastRenderKey === null
        ? -1
        : history.items.findIndex((item) => item.renderKey === previous?.lastRenderKey);
    const appendedItems =
      !isNewViewport && previousLatestIndex >= 0 && previousLatestIndex < history.items.length - 1
        ? history.items.slice(previousLatestIndex + 1)
        : [];
    const appendSource = appendedItems.some((item) => item.isMine && item.deliveryTone !== null)
      ? "current-user"
      : "realtime";
    const shouldFollowLatest =
      isNewViewport ||
      isFirstPopulatedSnapshot ||
      (appendedItems.length > 0 &&
        (viewportPositionRef.current !== "detached" || appendSource === "current-user"));

    if (isNewViewport) {
      viewportPositionRef.current = "initializing";
      dispatch({
        type: "reset",
        hasOlderMessages: history.canLoadOlder,
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

    let settleAnimationFrame: number | null = null;
    const scrollAnimationFrame = requestAnimationFrame(() => {
      virtualizerRef.current.scrollToIndex(history.items.length - 1, {
        align: "end",
      });

      settleAnimationFrame = requestAnimationFrame(() => {
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

    return () => {
      cancelAnimationFrame(scrollAnimationFrame);

      if (settleAnimationFrame !== null) {
        cancelAnimationFrame(settleAnimationFrame);
      }
    };
  }, [history.canLoadOlder, history.items, history.viewportKey]);

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
  }

  return (
    <div className="flex h-[clamp(22rem,62dvh,42rem)] min-h-0 flex-col bg-slate-50">
      {history.canLoadOlder ? (
        <div className="shrink-0 px-5 pt-5 text-center">
          <button
            className="secondary-button"
            disabled={history.isLoadingOlder}
            onClick={history.onLoadOlder}
            type="button"
          >
            {history.isLoadingOlder ? "이전 메시지 불러오는 중…" : "이전 메시지 불러오기"}
          </button>
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

      <div
        aria-label={history.roomLabel}
        aria-live="polite"
        aria-relevant="additions text"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6"
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

function MessageHistoryNotice({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[20rem] items-center justify-center">
      <p className="text-center text-sm text-slate-500">{message}</p>
    </div>
  );
}
