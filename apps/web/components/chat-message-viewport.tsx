"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { createChatMessageArrivalAnnouncement } from "@/components/chat-message-arrival-announcement";
import { canReportChatMessageReadState } from "@/components/chat-message-read-state-policy";
import {
  ChatRoomEntryNavigationNotice,
  type ChatRoomEntryNavigationNoticeViewModel,
} from "@/components/chat-room-entry-navigation-notice";
import {
  ChatMessageViewportArrivalAnnouncement,
  ChatMessageViewportHistoryError,
  ChatMessageViewportHistoryNotice,
  ChatMessageViewportNewMessagesButton,
  ChatMessageViewportOlderHistoryStatus,
  ChatMessageViewportVirtualRow,
} from "@/components/chat-message-viewport-presentation";
import {
  type ChatMessageAppendSource,
  type ChatMessageViewportInitialScrollTarget,
  type ChatMessageViewportPosition,
  createChatMessageViewportState,
  findChatMessageInitialScrollIndex,
  reduceChatMessageViewportState,
  shouldFollowLatestMessages,
} from "@/components/chat-message-viewport-state";
import type {
  ChatMessageHistoryFeedback,
  ChatMessageItemViewModel,
  ChatMessageViewportItemViewModel,
} from "@/components/chat-room-view-model";

const AT_END_THRESHOLD = 96;
const ESTIMATED_DATE_SEPARATOR_HEIGHT = 24;
const ESTIMATED_READ_BOUNDARY_HEIGHT = 28;
const ESTIMATED_MESSAGE_HEIGHT = 76;
const MESSAGE_GAP = 20;
const MESSAGE_OVERSCAN = 10;
const LATEST_SCROLL_SETTLE_FRAMES = 4;
const TOP_LOAD_THRESHOLD = 120;

export type ChatMessageViewportViewModel = Readonly<{
  canLoadOlder: boolean;
  entryNavigation: ChatRoomEntryNavigationNoticeViewModel | null;
  feedback: ChatMessageHistoryFeedback | null;
  initialScrollTarget: ChatMessageViewportInitialScrollTarget;
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
    initialScrollTarget,
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
  const canLoadOlderRef = useRef(canLoadOlder);
  const currentViewportKeyRef = useRef(history.viewportKey);
  const viewportPositionRef = useRef<ChatMessageViewportPosition>("initializing");
  const initialScrollInFlightRef = useRef(false);
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
    estimateSize: (index) => {
      const item = history.items[index];

      if (item?.kind === "date-separator") {
        return ESTIMATED_DATE_SEPARATOR_HEIGHT;
      }

      if (item?.kind === "read-boundary") {
        return ESTIMATED_READ_BOUNDARY_HEIGHT;
      }

      return ESTIMATED_MESSAGE_HEIGHT;
    },
    gap: MESSAGE_GAP,
    getItemKey: (index) => history.items[index]?.renderKey ?? index,
    getScrollElement: () => scrollElementRef.current,
    overscan: MESSAGE_OVERSCAN,
    useFlushSync: false,
  });
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;
  const virtualItems = virtualizer.getVirtualItems();
  canLoadOlderRef.current = canLoadOlder;
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
    initialScrollInFlightRef.current = false;
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

  const scrollToInitialTarget = useCallback(() => {
    if (viewportPositionRef.current !== "initializing" || initialScrollTarget.kind === "pending") {
      return;
    }

    const targetIndex = findChatMessageInitialScrollIndex(history.items, initialScrollTarget);

    if (targetIndex === null) {
      return;
    }

    if (initialScrollTarget.kind === "latest") {
      scrollToLatest();
      return;
    }

    const targetRenderKey = history.items[targetIndex]?.renderKey;

    if (!targetRenderKey) {
      return;
    }

    cancelLatestScroll();
    initialScrollInFlightRef.current = true;
    latestScrollFramesRef.current.scroll = requestAnimationFrame(() => {
      latestScrollFramesRef.current.scroll = null;
      virtualizerRef.current.scrollToIndex(targetIndex, {
        align: "start",
      });

      const settleAtTarget = (remainingFrames: number) => {
        latestScrollFramesRef.current.settle = requestAnimationFrame(() => {
          latestScrollFramesRef.current.settle = null;
          const scrollElement = scrollElementRef.current;

          if (!scrollElement) {
            initialScrollInFlightRef.current = false;
            return;
          }

          const targetElement = findRenderedAnchorElement(scrollElement, targetRenderKey);

          if (targetElement) {
            const currentOffset =
              targetElement.getBoundingClientRect().top - scrollElement.getBoundingClientRect().top;
            scrollElement.scrollTop += currentOffset;
          }

          if (remainingFrames > 1) {
            settleAtTarget(remainingFrames - 1);
            return;
          }

          const distanceFromEnd =
            scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight;
          const isAtEnd = distanceFromEnd <= AT_END_THRESHOLD;
          initialScrollInFlightRef.current = false;
          viewportPositionRef.current = isAtEnd ? "pinned" : "detached";
          dispatch({
            type: "viewport-ready",
            isAtEnd,
          });

          if (isAtEnd) {
            reportVisibleReadSequence();
          }
        });
      };

      settleAtTarget(LATEST_SCROLL_SETTLE_FRAMES);
    });
  }, [
    cancelLatestScroll,
    history.items,
    initialScrollTarget,
    reportVisibleReadSequence,
    scrollToLatest,
  ]);

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
    viewportPositionRef.current = "initializing";
    setOlderLoadError(null);
    setArrivalAnnouncement(null);
    cancelLatestScroll();
    dispatch({
      type: "reset",
      hasOlderMessages: canLoadOlderRef.current,
    });
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

    if (viewportPositionRef.current === "initializing") {
      return;
    }

    const frame = requestAnimationFrame(reportVisibleReadSequence);
    return () => cancelAnimationFrame(frame);
  }, [history.items, history.readStateEnabled, reportVisibleReadSequence]);

  useEffect(() => {
    const previous = previousItemsRef.current;
    const current = createItemsSnapshot(history.items, viewportKey);
    previousItemsRef.current = current;

    if (history.items.length === 0) {
      return;
    }

    const isNewViewport = previous?.viewportKey !== viewportKey;
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
    const isInitializing = isNewViewport || viewportPositionRef.current === "initializing";
    const shouldFollowLatest =
      !isInitializing &&
      appendedMessages.length > 0 &&
      shouldFollowLatestMessages(viewportPositionRef.current, appendSource);

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

      if (appendSource === "current-user" && !isInitializing) {
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
    scrollToInitialTarget();
    return cancelLatestScroll;
  }, [cancelLatestScroll, scrollToInitialTarget]);

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

    if (!initialScrollInFlightRef.current && scrollElement.scrollTop <= TOP_LOAD_THRESHOLD) {
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
      <ChatMessageViewportOlderHistoryStatus
        error={olderLoadError}
        isLoading={isLoadingOlder}
        onRetry={() => void loadOlderMessages()}
      />

      {history.feedback?.kind === "error" ? (
        <ChatMessageViewportHistoryError
          message={history.feedback.message}
          onRetry={history.onRetry}
          title={history.feedback.title}
        />
      ) : null}

      {history.entryNavigation ? (
        <ChatRoomEntryNavigationNotice notice={history.entryNavigation} />
      ) : null}

      <ChatMessageViewportArrivalAnnouncement announcement={arrivalAnnouncement} />

      <ChatMessageViewportNewMessagesButton
        count={viewportState.unseenMessageCount}
        onJumpToLatest={handleJumpToLatest}
      />

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
          <ChatMessageViewportHistoryNotice message={history.feedback.message} />
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
                <ChatMessageViewportVirtualRow
                  item={item}
                  key={virtualItem.key}
                  measureElement={virtualizer.measureElement}
                  onOpenMessageActions={history.onOpenMessageActions}
                  start={virtualItem.start}
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
