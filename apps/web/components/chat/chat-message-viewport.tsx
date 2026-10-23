"use client";

import { type KeyboardEvent, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
import type { ChatMessageViewportAnchor } from "@/components/chat/chat-message-viewport-anchor";
import type { ChatMessageViewportInitialScrollTarget } from "@/components/chat/chat-message-viewport-state";
import { isChatMessageViewportScrollKey } from "@/components/chat/chat-message-viewport-user-input";
import type {
  ChatMessageHistoryFeedback,
  ChatMessageItemViewModel,
  ChatMessageViewportItemViewModel,
} from "@/components/chat/chat-room-view-model";
import { useChatMessageViewportInitialTarget } from "@/components/chat/use-chat-message-viewport-initial-target";
import {
  type ChatMessageViewportLatestFollow,
  useChatMessageViewportLatestFollow,
} from "@/components/chat/use-chat-message-viewport-latest-follow";
import {
  type ChatMessageViewportOlderHistory,
  useChatMessageViewportOlderHistory,
} from "@/components/chat/use-chat-message-viewport-older-history";
import {
  isChatMessageViewportAtEnd,
  useChatMessageViewportPosition,
} from "@/components/chat/use-chat-message-viewport-position";
import { useChatMessageViewportReadReport } from "@/components/chat/use-chat-message-viewport-read-report";

const ESTIMATED_DATE_SEPARATOR_HEIGHT = 38;
const ESTIMATED_READ_BOUNDARY_HEIGHT = 42;
const ESTIMATED_SYSTEM_ACTIVITY_HEIGHT = 42;
const ESTIMATED_MESSAGE_HEIGHT = 76;
const MESSAGE_GAP = 6;
const MESSAGE_FOLLOWING_GAP_RESERVE = 14;
const MESSAGE_OVERSCAN = 10;
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
  const pendingAnchorRef = useRef<ChatMessageViewportAnchor | null>(null);
  const reportVisibleReadSequenceRef = useRef<() => void>(() => undefined);
  const latestFollowRef = useRef<ChatMessageViewportLatestFollow | null>(null);
  const olderHistoryRef = useRef<ChatMessageViewportOlderHistory | null>(null);
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
  const virtualItems = virtualizer.getVirtualItems();
  const { dispatchPosition, positionRef } = useChatMessageViewportPosition({
    initialScrollTarget,
    items: history.items,
    onInitialPositionReady,
    onJobSettled: () => reportVisibleReadSequenceRef.current(),
    onLatestReached: () => latestFollowRef.current?.markLatestReached(),
    onViewportChanged: (change) => {
      olderHistoryRef.current?.handleViewportChanged(change);

      if (!change.preserved) {
        latestFollowRef.current?.reset();
      }
    },
    pendingAnchorRef,
    scrollElementRef,
    viewportContinuityKey,
    viewportKey,
    virtualizer,
  });

  const reportVisibleReadSequence = useChatMessageViewportReadReport({
    items: history.items,
    latestConfirmedSequence,
    onReadThroughSequence,
    positionRef,
    readStateEnabled,
    readStatePaused,
    scrollElementRef,
  });
  // 자동 이동이 시작된 뒤 읽음 조건이 바뀔 수 있으므로 이동이 끝나는 시점의 조건으로 읽음을 보고함
  reportVisibleReadSequenceRef.current = reportVisibleReadSequence;

  const latestFollow = useChatMessageViewportLatestFollow({
    dispatchPosition,
    items: history.items,
    onNavigateToLatest: history.onNavigateToLatest,
    positionRef,
    viewportContinuityKey,
  });
  latestFollowRef.current = latestFollow;

  useChatMessageViewportInitialTarget({
    dispatchPosition,
    initialScrollTarget,
    items: history.items,
    positionRef,
    scrollElementRef,
    viewportKey,
  });

  const olderHistory = useChatMessageViewportOlderHistory({
    canLoadOlder,
    dispatchPosition,
    isHistoryLoadingOlder,
    items: history.items,
    onLoadOlder,
    pendingAnchorRef,
    scrollElementRef,
    viewportKey,
  });
  olderHistoryRef.current = olderHistory;

  function handleScroll() {
    const scrollElement = scrollElementRef.current;

    if (!scrollElement) {
      return;
    }

    const position = dispatchPosition({
      type: "scroll-observed",
      isAtEnd: isChatMessageViewportAtEnd(scrollElement),
    });

    if (position.phase !== "settled") {
      return;
    }

    reportVisibleReadSequence();

    if (scrollElement.scrollTop <= TOP_LOAD_THRESHOLD) {
      void olderHistory.loadOlderMessages();
    }
  }

  // scroll 이벤트는 코드가 움직인 것과 구분할 수 없으므로 목록 안에서 시작된 입력으로 사용자 스크롤을 판단함
  function handleUserScrollInput() {
    const scrollElement = scrollElementRef.current;

    if (!scrollElement) {
      return;
    }

    dispatchPosition({
      type: "user-scrolled",
      isAtEnd: isChatMessageViewportAtEnd(scrollElement),
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isChatMessageViewportScrollKey(event.key, event.target)) {
      handleUserScrollInput();
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-white">
      <ChatMessageViewportOlderHistoryStatus
        error={olderHistory.loadError}
        isLoading={olderHistory.isLoadingOlder}
        onRetry={() => void olderHistory.loadOlderMessages()}
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

      <ChatMessageViewportArrivalAnnouncement announcement={latestFollow.arrivalAnnouncement} />

      <ChatMessageViewportNewMessagesButton
        count={latestFollow.unseenMessageCount}
        label={history.onNavigateToLatest ? "최신 대화로 이동" : undefined}
        onJumpToLatest={latestFollow.jumpToLatest}
      />

      <div
        aria-label={history.roomLabel}
        aria-live="off"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-b-[4px] px-4 pt-4 pb-[10px]"
        data-viewport-key={viewportKey}
        onKeyDown={handleKeyDown}
        onPointerDown={handleUserScrollInput}
        onScroll={handleScroll}
        onTouchStart={handleUserScrollInput}
        onWheel={handleUserScrollInput}
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
