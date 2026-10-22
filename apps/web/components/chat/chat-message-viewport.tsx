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
  type ChatMessageViewportJob,
  type ChatMessageViewportPositionEvent,
  type ChatMessageViewportPositionState,
  createChatMessageViewportPositionState,
  reduceChatMessageViewportPosition,
  shouldCountUnseenChatMessages,
} from "@/components/chat/chat-message-viewport-position";
import {
  type ChatMessageViewportInitialScrollTarget,
  createChatMessageViewportState,
  findChatMessageInitialScrollIndex,
  reduceChatMessageViewportState,
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
  const positionRef = useRef<ChatMessageViewportPositionState>(
    createChatMessageViewportPositionState(),
  );
  const jobFramesRef = useRef<ChatMessageViewportScrollFrames>({
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
  // 자동 이동은 여러 frame에 걸쳐 실행되므로 시작 시점이 아니라 실행 시점의 목록과 진입 목표를 읽음
  const itemsRef = useRef(history.items);
  itemsRef.current = history.items;
  const initialScrollTargetRef = useRef(initialScrollTarget);
  initialScrollTargetRef.current = initialScrollTarget;
  const onInitialPositionReadyRef = useRef(onInitialPositionReady);
  onInitialPositionReadyRef.current = onInitialPositionReady;

  const notifyInitialPositionReady = useCallback((positionedViewportKey: string) => {
    if (
      currentViewportKeyRef.current !== positionedViewportKey ||
      positionedViewportKeyRef.current === positionedViewportKey
    ) {
      return;
    }

    positionedViewportKeyRef.current = positionedViewportKey;
    onInitialPositionReadyRef.current?.(positionedViewportKey);
  }, []);

  const reportVisibleReadSequence = useCallback(() => {
    if (latestConfirmedSequence === null) {
      return;
    }

    const scrollElement = scrollElementRef.current;
    const position = positionRef.current;

    if (
      !canReportChatMessageReadState({
        documentHasFocus: document.hasFocus(),
        documentVisibilityState: document.visibilityState,
        isLatestSequenceVisible:
          scrollElement !== null && isSequenceVisible(scrollElement, latestConfirmedSequence),
        readStateEnabled,
        readStatePaused,
        viewportPhase: position.phase,
        viewportPin: position.pin,
      })
    ) {
      return;
    }

    onReadThroughSequence(latestConfirmedSequence);
  }, [latestConfirmedSequence, onReadThroughSequence, readStateEnabled, readStatePaused]);
  // 자동 이동이 시작된 뒤 읽음 조건이 바뀔 수 있으므로 이동이 끝나는 시점의 조건으로 읽음을 보고함
  const reportVisibleReadSequenceRef = useRef(reportVisibleReadSequence);
  reportVisibleReadSequenceRef.current = reportVisibleReadSequence;

  const cancelJobFrames = useCallback(() => {
    const frames = jobFramesRef.current;

    if (frames.scroll !== null) {
      cancelAnimationFrame(frames.scroll);
    }

    if (frames.settle !== null) {
      cancelAnimationFrame(frames.settle);
    }

    jobFramesRef.current = {
      scroll: null,
      settle: null,
    };
  }, []);

  const startJobRef = useRef<(job: ChatMessageViewportJob) => void>(() => undefined);

  const dispatchPosition = useCallback(
    (event: ChatMessageViewportPositionEvent): ChatMessageViewportPositionState => {
      const previous = positionRef.current;
      const next = reduceChatMessageViewportPosition(previous, event);
      positionRef.current = next;

      if (next === previous) {
        return next;
      }

      if (next.job !== previous.job) {
        cancelJobFrames();

        if (next.job !== null) {
          startJobRef.current(next.job);
        }
      }

      if (next.phase === "settled" && next.pin === "pinned") {
        dispatch({ type: "latest-reached" });
      }

      if (previous.phase !== "settled" && next.phase === "settled") {
        notifyInitialPositionReady(currentViewportKeyRef.current);
      }

      return next;
    },
    [cancelJobFrames, notifyInitialPositionReady],
  );

  startJobRef.current = (job) => {
    const frames = jobFramesRef.current;

    const settleJob = (isAtEnd: boolean) => {
      dispatchPosition({
        type: "job-settled",
        isAtEnd,
        jobId: job.id,
      });
      reportVisibleReadSequenceRef.current();
    };

    const runLatest = () => {
      frames.scroll = requestAnimationFrame(() => {
        frames.scroll = null;
        const latestIndex = itemsRef.current.length - 1;

        if (latestIndex < 0) {
          const scrollElement = scrollElementRef.current;
          settleJob(scrollElement === null || isScrollElementAtEnd(scrollElement));
          return;
        }

        virtualizerRef.current.scrollToIndex(latestIndex, {
          align: "end",
        });

        const settleAtLatest = (remainingFrames: number) => {
          frames.settle = requestAnimationFrame(() => {
            frames.settle = null;
            const scrollElement = scrollElementRef.current;

            if (!scrollElement) {
              return;
            }

            scrollElement.scrollTop = scrollElement.scrollHeight;

            if (remainingFrames > 1) {
              settleAtLatest(remainingFrames - 1);
              return;
            }

            settleJob(true);
          });
        };

        settleAtLatest(LATEST_SCROLL_SETTLE_FRAMES);
      });
    };

    const runInitial = (byLatestIntent: boolean) => {
      const target = initialScrollTargetRef.current;

      if (byLatestIntent || target.kind === "latest") {
        runLatest();
        return;
      }

      frames.scroll = requestAnimationFrame(() => {
        frames.scroll = null;
        const items = itemsRef.current;
        const targetIndex = findChatMessageInitialScrollIndex(items, target);
        const targetRenderKey = targetIndex === null ? undefined : items[targetIndex]?.renderKey;

        if (targetIndex === null || !targetRenderKey) {
          const scrollElement = scrollElementRef.current;
          settleJob(scrollElement === null || isScrollElementAtEnd(scrollElement));
          return;
        }

        virtualizerRef.current.scrollToIndex(targetIndex, {
          align: target.kind === "message" ? "center" : "start",
        });

        const settleAtTarget = (remainingFrames: number) => {
          frames.settle = requestAnimationFrame(() => {
            frames.settle = null;
            const scrollElement = scrollElementRef.current;

            if (!scrollElement) {
              return;
            }

            const targetElement = findRenderedChatMessageAnchorElement(
              scrollElement,
              targetRenderKey,
            );

            if (targetElement) {
              const currentOffset =
                targetElement.getBoundingClientRect().top -
                scrollElement.getBoundingClientRect().top;
              const targetOffset =
                target.kind === "message"
                  ? Math.max(
                      0,
                      (scrollElement.clientHeight - targetElement.getBoundingClientRect().height) /
                        2,
                    )
                  : 0;
              scrollElement.scrollTop += currentOffset - targetOffset;

              if (target.kind === "message") {
                targetElement.focus({ preventScroll: true });
              }
            }

            if (remainingFrames > 1) {
              settleAtTarget(remainingFrames - 1);
              return;
            }

            settleJob(isScrollElementAtEnd(scrollElement));
          });
        };

        settleAtTarget(LATEST_SCROLL_SETTLE_FRAMES);
      });
    };

    const runAnchor = () => {
      frames.scroll = requestAnimationFrame(() => {
        frames.scroll = null;
        const anchor = pendingAnchorRef.current;
        const anchorIndex =
          anchor === null
            ? -1
            : itemsRef.current.findIndex((item) => item.renderKey === anchor.renderKey);

        if (anchor === null || anchorIndex < 0) {
          const scrollElement = scrollElementRef.current;
          settleJob(scrollElement !== null && isScrollElementAtEnd(scrollElement));
          return;
        }

        virtualizerRef.current.scrollToIndex(anchorIndex, {
          align: "start",
        });

        const settleAtAnchor = (remainingFrames: number) => {
          frames.settle = requestAnimationFrame(() => {
            frames.settle = null;
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
                return;
              }

              // 기준 항목을 찾지 못하면 대기 anchor를 남겨 다음 목록 변경 때 다시 복원함
              settleJob(isScrollElementAtEnd(scrollElement));
              return;
            }

            const currentOffset =
              anchorElement.getBoundingClientRect().top - scrollElement.getBoundingClientRect().top;
            scrollElement.scrollTop += currentOffset - anchor.offsetFromViewportTop;
            pendingAnchorRef.current = null;
            settleJob(isScrollElementAtEnd(scrollElement));
          });
        };

        settleAtAnchor(OLDER_SCROLL_SETTLE_FRAMES);
      });
    };

    switch (job.kind) {
      case "initial":
        runInitial(job.byLatestIntent);
        return;
      case "latest":
      case "resize":
        runLatest();
        return;
      case "anchor":
        runAnchor();
        return;
    }
  };

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
    const continuityChanged = activeViewportContinuityKeyRef.current !== viewportContinuityKey;
    activeViewportContinuityKeyRef.current = viewportContinuityKey;
    const position = dispatchPosition({
      type: "viewport-changed",
      continuityChanged,
    });

    if (position.phase === "settled") {
      notifyInitialPositionReady(viewportKey);
      return;
    }

    setOlderLoadError(null);
    setArrivalAnnouncement(null);
    dispatch({
      type: "reset",
      hasOlderMessages: canLoadOlderRef.current,
    });
  }, [dispatchPosition, notifyInitialPositionReady, viewportContinuityKey, viewportKey]);

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

    const notifyViewportResized = () => {
      if (resizeFrame !== null) {
        cancelAnimationFrame(resizeFrame);
      }

      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        dispatchPosition({ type: "viewport-resized" });
      });
    };

    window.addEventListener("resize", notifyViewportResized);
    visualViewport?.addEventListener("resize", notifyViewportResized);
    visualViewport?.addEventListener("scroll", notifyViewportResized);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(notifyViewportResized);
    const scrollElement = scrollElementRef.current;

    if (scrollElement) {
      resizeObserver?.observe(scrollElement);
    }

    return () => {
      window.removeEventListener("resize", notifyViewportResized);
      visualViewport?.removeEventListener("resize", notifyViewportResized);
      visualViewport?.removeEventListener("scroll", notifyViewportResized);
      resizeObserver?.disconnect();

      if (resizeFrame !== null) {
        cancelAnimationFrame(resizeFrame);
      }
    };
  }, [dispatchPosition]);

  useEffect(() => {
    if (!history.readStateEnabled) {
      return;
    }

    if (positionRef.current.phase !== "settled") {
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

    if (isNewViewport) {
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
    }

    if (appendedMessages.length === 0 && !hasAppendedSystemActivity) {
      return;
    }

    const appendEvent = {
      type: "messages-appended",
      hasMessages: appendedMessages.length > 0,
      hasSystemActivity: hasAppendedSystemActivity,
      source: appendSource,
    } as const;

    if (shouldCountUnseenChatMessages(positionRef.current, appendEvent)) {
      dispatch({
        type: "unseen-messages-added",
        count: appendedMessages.length,
      });
    }

    dispatchPosition(appendEvent);
  }, [canLoadOlder, dispatchPosition, history.items, viewportContinuityKey]);

  useEffect(() => {
    if (positionRef.current.phase !== "waiting" || initialScrollTarget.kind === "pending") {
      return;
    }

    const scrollElement = scrollElementRef.current;
    dispatchPosition({
      type: "target-resolved",
      hasItems: history.items.length > 0,
      hasTarget: findChatMessageInitialScrollIndex(history.items, initialScrollTarget) !== null,
      isAtEnd: scrollElement === null || isScrollElementAtEnd(scrollElement),
    });
  }, [dispatchPosition, history.items, initialScrollTarget, viewportKey]);

  useEffect(() => {
    const anchor = pendingAnchorRef.current;

    if (!anchor || anchor.viewportKey !== viewportKey) {
      return;
    }

    if (!history.items.some((item) => item.renderKey === anchor.renderKey)) {
      return;
    }

    dispatchPosition({ type: "older-anchor-rendered" });
  }, [dispatchPosition, history.items, viewportKey]);

  useEffect(() => cancelJobFrames, [cancelJobFrames]);

  function handleScroll() {
    const scrollElement = scrollElementRef.current;

    if (!scrollElement) {
      return;
    }

    const position = dispatchPosition({
      type: "scroll-observed",
      isAtEnd: isScrollElementAtEnd(scrollElement),
    });

    if (position.phase !== "settled") {
      return;
    }

    if (position.pin === "pinned") {
      reportVisibleReadSequence();
    }

    if (scrollElement.scrollTop <= TOP_LOAD_THRESHOLD) {
      void loadOlderMessages();
    }
  }

  function handleJumpToLatest() {
    dispatch({ type: "jump-to-latest" });

    if (history.onNavigateToLatest) {
      dispatchPosition({
        type: "latest-requested",
        navigatesContext: true,
      });
      history.onNavigateToLatest();
      return;
    }

    dispatchPosition({
      type: "latest-requested",
      navigatesContext: false,
    });
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

function isScrollElementAtEnd(scrollElement: HTMLDivElement): boolean {
  return (
    scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight <=
    AT_END_THRESHOLD
  );
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
