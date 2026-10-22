"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { createChatMessageArrivalAnnouncement } from "@/components/chat/chat-message-arrival-announcement";
import { canReportChatMessageReadState } from "@/components/chat/chat-message-read-state-policy";
import {
  ChatRoomEntryNavigationNotice,
  type ChatRoomEntryNavigationNoticeViewModel,
} from "@/components/chat/chat-room-entry-navigation-notice";
import {
  ChatMessageViewportArrivalAnnouncement,
  ChatMessageViewportHistoryError,
  ChatMessageViewportHistoryNotice,
  ChatMessageViewportNewMessagesButton,
  ChatMessageViewportOlderHistoryStatus,
  ChatMessageViewportVirtualRow,
} from "@/components/chat/chat-message-viewport-presentation";
import {
  type ChatMessageViewportAnchor,
  captureChatMessageViewportAnchor,
  findRenderedChatMessageAnchorElement,
} from "@/components/chat/chat-message-viewport-anchor";
import {
  type ChatMessageViewportItemsSnapshot,
  createChatMessageViewportItemsSnapshot,
  detectChatMessageViewportAppend,
} from "@/components/chat/chat-message-viewport-append";
import {
  type ChatMessageViewportInitialScrollTarget,
  type ChatMessageViewportPosition,
  createChatMessageViewportState,
  findChatMessageInitialScrollIndex,
  reduceChatMessageViewportState,
  shouldFollowLatestMessages,
  shouldPreserveChatMessageViewport,
} from "@/components/chat/chat-message-viewport-state";
import type {
  ChatMessageHistoryFeedback,
  ChatMessageItemViewModel,
  ChatMessageViewportItemViewModel,
} from "@/components/chat/chat-room-view-model";

const AT_END_THRESHOLD = 96;
const ESTIMATED_DATE_SEPARATOR_HEIGHT = 38;
const ESTIMATED_READ_BOUNDARY_HEIGHT = 42;
const ESTIMATED_SYSTEM_ACTIVITY_HEIGHT = 42;
const ESTIMATED_MESSAGE_HEIGHT = 76;
const MESSAGE_GAP = 6;
const MESSAGE_FOLLOWING_GAP_RESERVE = 14;
const MESSAGE_OVERSCAN = 10;
const LATEST_SCROLL_SETTLE_FRAMES = 4;
const OLDER_SCROLL_SETTLE_FRAMES = 4;
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
  onNavigateToLatest?: (() => void) | null;
  onOpenMessageActions: (item: ChatMessageItemViewModel, trigger: HTMLButtonElement) => void;
  onReadThroughSequence: (throughSequence: number) => void;
  onRetry: () => void;
  readStateEnabled: boolean;
  readStatePaused: boolean;
  roomLabel: string;
  targetMessageId?: string | null;
  viewportContinuityKey: string;
  viewportKey: string;
}>;

export type ChatMessageViewportLoadOlderResult = Readonly<{
  hasOlderMessages: boolean;
}>;

export function ChatMessageViewport({
  history,
  onInitialPositionReady,
}: {
  history: ChatMessageViewportViewModel;
  onInitialPositionReady?: (viewportKey: string) => void;
}) {
  const {
    canLoadOlder,
    initialScrollTarget,
    isLoadingOlder: isHistoryLoadingOlder,
    latestConfirmedSequence,
    onLoadOlder,
    onReadThroughSequence,
    readStateEnabled,
    readStatePaused,
    viewportContinuityKey,
    viewportKey,
  } = history;
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const previousItemsRef = useRef<ChatMessageViewportItemsSnapshot | null>(null);
  const pendingAnchorRef = useRef<ChatMessageViewportAnchor | null>(null);
  const olderRequestInFlightRef = useRef(false);
  const canLoadOlderRef = useRef(canLoadOlder);
  const currentViewportKeyRef = useRef(history.viewportKey);
  const activeViewportContinuityKeyRef = useRef(history.viewportContinuityKey);
  const positionedViewportKeyRef = useRef<string | null>(null);
  const viewportPositionRef = useRef<ChatMessageViewportPosition>("initializing");
  const initialScrollInFlightRef = useRef(false);
  const latestScrollFramesRef = useRef<ChatMessageViewportScrollFrames>({
    scroll: null,
    settle: null,
  });
  const arrivalAnnouncementSequenceRef = useRef(0);
  const latestScrollAfterNavigationRef = useRef(false);
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

      if (item?.kind === "system-activity") {
        return ESTIMATED_SYSTEM_ACTIVITY_HEIGHT;
      }

      const preservesFollowingGap =
        item?.kind === "message" &&
        (item.item.endsSenderGroup ||
          (item.item.deliveryTone === "pending" && item.item.deliveryLabel !== null));

      return ESTIMATED_MESSAGE_HEIGHT + (preservesFollowingGap ? MESSAGE_FOLLOWING_GAP_RESERVE : 0);
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

  const notifyInitialPositionReady = useCallback(
    (positionedViewportKey: string) => {
      if (
        currentViewportKeyRef.current !== positionedViewportKey ||
        positionedViewportKeyRef.current === positionedViewportKey
      ) {
        return;
      }

      positionedViewportKeyRef.current = positionedViewportKey;
      onInitialPositionReady?.(positionedViewportKey);
    },
    [onInitialPositionReady],
  );

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

    const positionedViewportKey = viewportKey;
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
          latestScrollAfterNavigationRef.current = false;
          dispatch({
            type: "viewport-ready",
            isAtEnd: true,
          });
          notifyInitialPositionReady(positionedViewportKey);
          reportVisibleReadSequence();
        });
      };

      settleAtLatest(LATEST_SCROLL_SETTLE_FRAMES);
    });
  }, [
    cancelLatestScroll,
    history.items.length,
    notifyInitialPositionReady,
    reportVisibleReadSequence,
    viewportKey,
  ]);
  const scrollToLatestRef = useRef(scrollToLatest);
  scrollToLatestRef.current = scrollToLatest;

  const scrollToInitialTarget = useCallback(() => {
    if (viewportPositionRef.current !== "initializing" || initialScrollTarget.kind === "pending") {
      return;
    }

    // 최신 대화 복귀로 timeline이 다시 초기화되면 진입 시 목표 대신 최신 메시지로 이동함
    // 정착 전에 effect가 다시 실행돼도 같은 목표를 유지하도록 표시는 정착 완료 시 지움
    if (latestScrollAfterNavigationRef.current && history.items.length > 0) {
      scrollToLatest();
      return;
    }

    const targetIndex = findChatMessageInitialScrollIndex(history.items, initialScrollTarget);

    if (targetIndex === null) {
      const scrollElement = scrollElementRef.current;
      const isAtEnd =
        scrollElement === null ||
        scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight <=
          AT_END_THRESHOLD;
      viewportPositionRef.current = isAtEnd ? "pinned" : "detached";
      dispatch({
        type: "viewport-ready",
        isAtEnd,
      });
      notifyInitialPositionReady(viewportKey);
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
    const positionedViewportKey = viewportKey;
    latestScrollFramesRef.current.scroll = requestAnimationFrame(() => {
      latestScrollFramesRef.current.scroll = null;
      virtualizerRef.current.scrollToIndex(targetIndex, {
        align: initialScrollTarget.kind === "message" ? "center" : "start",
      });

      const settleAtTarget = (remainingFrames: number) => {
        latestScrollFramesRef.current.settle = requestAnimationFrame(() => {
          latestScrollFramesRef.current.settle = null;
          const scrollElement = scrollElementRef.current;

          if (!scrollElement) {
            initialScrollInFlightRef.current = false;
            return;
          }

          const targetElement = findRenderedChatMessageAnchorElement(
            scrollElement,
            targetRenderKey,
          );

          if (targetElement) {
            const currentOffset =
              targetElement.getBoundingClientRect().top - scrollElement.getBoundingClientRect().top;
            const targetOffset =
              initialScrollTarget.kind === "message"
                ? Math.max(
                    0,
                    (scrollElement.clientHeight - targetElement.getBoundingClientRect().height) / 2,
                  )
                : 0;
            scrollElement.scrollTop += currentOffset - targetOffset;

            if (initialScrollTarget.kind === "message") {
              targetElement.focus({ preventScroll: true });
            }
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
          notifyInitialPositionReady(positionedViewportKey);

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
    notifyInitialPositionReady,
    reportVisibleReadSequence,
    scrollToLatest,
    viewportKey,
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
    const anchor = scrollElement ? captureChatMessageViewportAnchor(scrollElement) : null;

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
    const preservesViewport = shouldPreserveChatMessageViewport({
      currentContinuityKey: viewportContinuityKey,
      position: viewportPositionRef.current,
      previousContinuityKey: activeViewportContinuityKeyRef.current,
    });
    activeViewportContinuityKeyRef.current = viewportContinuityKey;
    cancelLatestScroll();

    if (preservesViewport) {
      notifyInitialPositionReady(viewportKey);

      // 최신 대화 복귀로 원래 timeline에 돌아오면 이전 스크롤 위치 대신 최신 메시지로 이동함
      if (latestScrollAfterNavigationRef.current) {
        scrollToLatestRef.current();
      }
      return;
    }

    viewportPositionRef.current = "initializing";
    setOlderLoadError(null);
    setArrivalAnnouncement(null);
    dispatch({
      type: "reset",
      hasOlderMessages: canLoadOlderRef.current,
    });
  }, [cancelLatestScroll, notifyInitialPositionReady, viewportContinuityKey, viewportKey]);

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
    previousItemsRef.current = createChatMessageViewportItemsSnapshot(
      history.items,
      viewportContinuityKey,
    );

    if (history.items.length === 0) {
      return;
    }

    const {
      appendedMessages,
      hasAppendedSystemActivity,
      isNewViewport,
      source: appendSource,
    } = detectChatMessageViewportAppend({
      items: history.items,
      previous,
      viewportContinuityKey,
    });
    const isInitializing = isNewViewport || viewportPositionRef.current === "initializing";
    const shouldFollowLatest =
      !isInitializing &&
      ((appendedMessages.length > 0 &&
        shouldFollowLatestMessages(viewportPositionRef.current, appendSource)) ||
        (hasAppendedSystemActivity && viewportPositionRef.current !== "detached"));

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
  }, [
    canLoadOlder,
    cancelLatestScroll,
    history.items,
    scrollToLatest,
    viewportContinuityKey,
    viewportKey,
  ]);

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

      const settleAtAnchor = (remainingFrames: number) => {
        settleAnimationFrame = requestAnimationFrame(() => {
          const scrollElement = scrollElementRef.current;

          if (!scrollElement) {
            return;
          }

          const anchorElement = findRenderedChatMessageAnchorElement(
            scrollElement,
            anchor.renderKey,
          );

          if (!anchorElement) {
            if (remainingFrames > 1) {
              settleAtAnchor(remainingFrames - 1);
            }

            return;
          }

          const currentOffset =
            anchorElement.getBoundingClientRect().top - scrollElement.getBoundingClientRect().top;
          scrollElement.scrollTop += currentOffset - anchor.offsetFromViewportTop;
          pendingAnchorRef.current = null;
        });
      };

      settleAtAnchor(OLDER_SCROLL_SETTLE_FRAMES);
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

    // 목록이 비면서 브라우저가 보정한 scroll이 초기 위치를 확정하지 않도록 초기 위치 이동 전 scroll은 무시함
    if (viewportPositionRef.current === "initializing" && !initialScrollInFlightRef.current) {
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
    if (history.onNavigateToLatest) {
      latestScrollAfterNavigationRef.current = true;
      dispatch({ type: "jump-to-latest" });
      history.onNavigateToLatest();
      return;
    }

    viewportPositionRef.current = "pinned";
    dispatch({ type: "jump-to-latest" });
    scrollToLatest();
  }

  const isLoadingOlder = isHistoryLoadingOlder || viewportState.olderHistory === "loading";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-white">
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
        label={history.onNavigateToLatest ? "최신 대화로 이동" : undefined}
        onJumpToLatest={handleJumpToLatest}
      />

      <div
        aria-label={history.roomLabel}
        aria-live="off"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-b-[4px] px-4 pt-4 pb-[10px]"
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
                  targetMessageId={history.targetMessageId ?? null}
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

type ChatMessageArrivalAnnouncement = Readonly<{
  id: number;
  message: string;
}>;

type ChatMessageViewportScrollFrames = {
  scroll: number | null;
  settle: number | null;
};

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
