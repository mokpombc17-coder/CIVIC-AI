"use client";

import { useCallback, useState } from "react";
import type { ChatMessageViewportReachedLatestPosition } from "@/components/chat/chat-message-viewport";
import type { ChatMessageViewportInitialScrollTarget } from "@/components/chat/chat-message-viewport-state";
import {
  createChatMessageRenderKey,
  createChatRoomHeaderViewModel,
  type ChatMessageHistoryFeedback,
} from "@/components/chat/chat-room-view-model";
import { useChatRoomMessageExperience } from "@/components/chat/use-chat-room-message-experience";
import { useChatRoomReadExperience } from "@/components/chat/use-chat-room-read-experience";
import type { ChatRoomRealtimeExperience } from "@/components/chat/use-chat-room-realtime-experience";
import { useChatRoomParticipantProfiles } from "@/components/chat/use-chat-room-screen-data";
import type { RoomMessageContextController } from "@/components/chat/use-room-message-context";
import { chatRoomApi } from "@/lib/chat/chat-room-api";
import { useRoomDetailsQuery } from "@/lib/chat/chat-room-queries";
import { createChatRoomEntryErrorPresentation } from "@/lib/chat/chat-room-entry-error-presentation";
import { createRoomMessageContextErrorPresentation } from "@/lib/chat/chat-room-message-search-error-presentation";

export function useChatRoomContentExperience(
  roomId: string,
  roomQuery: ReturnType<typeof useRoomDetailsQuery>,
  realtime: ChatRoomRealtimeExperience,
  messageNavigation: RoomMessageContextController,
) {
  const { coordinator, messageHistory, participationHistory, receiptStateQuery, session } =
    realtime;
  const participantProfiles = useChatRoomParticipantProfiles(roomId, {
    enabled: realtime.messageHistoryEnabled,
  });
  const messageNavigationActive = messageNavigation.mode !== null;
  const contextNavigationActive = messageNavigation.mode === "context";
  // 읽은 위치로 이동한 대화는 읽은 위치부터 끊김 없이 이어지므로 검색으로 이동한 대화와 달리
  // 안 읽은 구분선을 보여 주고 화면에서 본 메시지까지 읽음을 보고함
  const entryNavigationActive = messageNavigationActive && messageNavigation.purpose === "entry";
  const searchContextActive = contextNavigationActive && !entryNavigationActive;
  const confirmedMessages = messageNavigationActive
    ? messageNavigation.messages
    : messageHistory.messages;
  const { fetchNextPage } = messageHistory;
  const room = roomQuery.data;
  const roomClosed = room?.status === "CLOSED";
  const latestConfirmedSequence = messageHistory.messages.at(-1)?.roomSequence ?? null;
  const loadFirstUnreadMessage = useCallback(
    async (afterSequence: number) => {
      const response = await chatRoomApi.getRoomMessages(roomId, {
        afterSequence,
        limit: 1,
        mode: "after",
      });
      return response.items[0] ?? null;
    },
    [roomId],
  );
  const { openContext } = messageNavigation;
  // 읽은 위치가 최신 페이지보다 이전이면 첫 안 읽은 메시지 주변을 불러와 읽은 위치로 이동한 대화로 보여 줌
  const openEntryContext = useCallback(
    (messageId: string) => openContext(messageId, "entry"),
    [openContext],
  );
  const read = useChatRoomReadExperience({
    connectionErrorCode: session.connectionError?.code ?? null,
    enabled: session.isActive,
    generation: session.generation,
    history: messageHistory.entryHistory,
    historyReady: messageHistory.status === "success",
    latestConfirmedSequence,
    loadFirstUnreadMessage,
    onJumpToMessage: openEntryContext,
    membership: room?.myMembership ?? null,
    messageVisibleAfterSequence: session.messageVisibleAfterSequence,
    onRefetchReceiptState: receiptStateQuery.refetch,
    onRefetchRoom: roomQuery.refetch,
    participationStatus: room?.participationStatus,
    readStateReady: realtime.realtimeReady,
    receiptState: receiptStateQuery.data,
    receiptStateReady:
      receiptStateQuery.status === "success" && coordinator.readReceiptStatus === "ready",
    receiptStateUnavailable:
      receiptStateQuery.status === "error" ||
      coordinator.readReceiptStatus === "error" ||
      coordinator.readReceiptStatus === "terminal",
    roomErrorCode: session.error?.code ?? null,
    roomId,
    roomStatus: room?.status,
  });
  const message = useChatRoomMessageExperience({
    confirmedMessages,
    enabled: session.isActive,
    generation: session.generation,
    includeOutgoingMessages: !contextNavigationActive,
    messageVisibleAfterSequence: session.messageVisibleAfterSequence ?? 0,
    participantProfiles,
    participationHistory,
    readBoundaryAfterSequence: searchContextActive ? null : read.readBoundaryAfterSequence,
    receiptState: receiptStateQuery.data,
    receiptSyncStatus: coordinator.readReceiptStatus,
    roomId,
    selfMembershipId: room?.myMembership?.membershipId ?? null,
    systemActivities: messageNavigationActive ? [] : realtime.systemActivities,
  });
  const { loadNewer: loadNewerContextMessages, loadOlder: loadOlderContextMessages } =
    messageNavigation;
  const loadOlderContext = useCallback(async () => {
    const result = await loadOlderContextMessages();
    return { hasOlderMessages: result.hasMore };
  }, [loadOlderContextMessages]);
  // 이동한 대화에서 최신 대화로 돌아갈 때 최신 대화를 어느 위치에 보여 줄지 기억함
  // 아래로 끝까지 읽어서 돌아가면 보던 메시지 위치에, 메시지를 보내서 돌아가면 맨 아래에 보여 줌
  const liveReturnKey = `${roomId}:${session.generation}`;
  const [liveReturn, setLiveReturn] = useState<Readonly<{
    key: string;
    target: ChatMessageViewportInitialScrollTarget;
  }> | null>(null);
  const liveReturnTarget = liveReturn?.key === liveReturnKey ? liveReturn.target : null;
  const { closeContext } = messageNavigation;
  const liveMessages = messageHistory.messages;
  const handleReachedLatest = useCallback(
    (position: ChatMessageViewportReachedLatestPosition) => {
      // 최신 대화에는 최신 메시지부터 일부만 들어 있어 보던 메시지가 아직 없을 수 있음
      // 없으면 돌아간 뒤 같은 높이에 놓을 수 없어 화면이 튀므로 돌아가지 않고 사용자가 더 내려올 때까지 기다림
      if (
        !liveMessages.some(
          (liveMessage) =>
            createChatMessageRenderKey(liveMessage.clientMessageId) === position.renderKey,
        )
      ) {
        return;
      }

      setLiveReturn({ key: liveReturnKey, target: { kind: "anchor", ...position } });
      closeContext();
    },
    [closeContext, liveMessages, liveReturnKey],
  );
  const handleMessageSent = useCallback(() => {
    if (!contextNavigationActive) {
      return;
    }

    setLiveReturn({ key: liveReturnKey, target: { kind: "latest" } });
    closeContext();
  }, [closeContext, contextNavigationActive, liveReturnKey]);
  const loadOlder = useCallback(async () => {
    const result = await fetchNextPage();

    if (result.isError) {
      throw result.error;
    }

    return {
      hasOlderMessages: result.hasNextPage,
    };
  }, [fetchNextPage]);

  return {
    header: createChatRoomHeaderViewModel({
      memberCount: room?.activeMemberCount,
      name: room?.name,
      participationStatus: room?.participationStatus,
      roomId,
      roomStatus: room?.status,
      status: roomQuery.status,
    }),
    messageActions: message.actions,
    onMessageSent: handleMessageSent,
    messageHistory: {
      // 아래에 붙는 메시지를 새 메시지로 보면 화면이 따라 내려가거나 개수 안내가 뜸
      // 이동한 대화에서는 스크롤로 불러온 기존 메시지이므로 history로 표시해 그 처리를 막음
      appendMode: contextNavigationActive ? ("history" as const) : ("realtime" as const),
      canLoadNewer:
        realtime.messageHistoryEnabled &&
        !roomClosed &&
        contextNavigationActive &&
        messageNavigation.hasNewer,
      canLoadOlder: canLoadOlderChatRoomMessages({
        contextHasOlder: messageNavigation.hasOlder,
        contextNavigationActive,
        hasNextPage: messageHistory.hasNextPage,
        isHistoryEnabled: realtime.messageHistoryEnabled,
        roomClosed,
      }),
      entryNavigation: roomClosed || contextNavigationActive ? null : read.entryNavigationNotice,
      feedback: roomClosed
        ? null
        : contextNavigationActive
          ? createChatRoomMessageNavigationFeedback(messageNavigation)
          : createChatRoomMessageHistoryFeedback({
              error: messageHistory.error,
              isHistoryEnabled: realtime.messageHistoryEnabled,
              isError: messageHistory.isError && !messageHistory.isFetchNextPageError,
              isPending: messageHistory.isPending,
              hasSystemActivities: message.viewportItems.some(
                (item) => item.kind === "system-activity",
              ),
              messageCount: message.messageItems.length,
            }),
      // Context 목록이 도착하기 전에 대상 메시지를 넘기면 viewport가 빈 목록을 보고 위치를 먼저 확정함
      // 재연결로 다시 연 대화는 원래 이동 위치가 아니라 끊기기 전 보던 위치로 돌아감
      initialScrollTarget:
        messageNavigationActive && messageNavigation.targetMessageId && !messageNavigation.isPending
          ? messageNavigation.restoreAnchor
            ? ({ kind: "anchor", ...messageNavigation.restoreAnchor } as const)
            : entryNavigationActive
              ? read.initialScrollTarget
              : ({ kind: "message", messageId: messageNavigation.targetMessageId } as const)
          : messageNavigationActive
            ? ({ kind: "pending" } as const)
            : (liveReturnTarget ?? read.initialScrollTarget),
      isLoadingOlder: contextNavigationActive
        ? messageNavigation.isLoadingOlder
        : messageHistory.isFetchingNextPage,
      items: roomClosed ? [] : message.viewportItems,
      latestConfirmedSequence,
      onLoadNewer: loadNewerContextMessages,
      onLoadOlder: contextNavigationActive ? loadOlderContext : loadOlder,
      onNavigateToLatest: messageNavigationActive ? messageNavigation.closeContext : null,
      onOpenMessageActions: message.actions.openMessageActions,
      onReachedLatest: contextNavigationActive ? handleReachedLatest : null,
      onReadThroughSequence: read.onReadThroughSequence,
      onRetry: contextNavigationActive
        ? () => void messageNavigation.retry()
        : () => void messageHistory.refetch(),
      onViewportAnchorSettled: messageNavigationActive
        ? messageNavigation.rememberViewportAnchor
        : null,
      readStateEnabled: read.readStateEnabled && !searchContextActive,
      roomLabel: `${roomId} 메시지`,
      targetMessageId:
        messageNavigationActive && !entryNavigationActive
          ? messageNavigation.targetMessageId
          : null,
      viewportContinuityKey: messageNavigationActive
        ? `${roomId}:message-navigation:${messageNavigation.timelineKey}`
        : roomId,
      viewportKey: messageNavigationActive
        ? `${message.viewportKey}:message-navigation:${messageNavigation.timelineKey}`
        : message.viewportKey,
    },
    participantDisplayNames: message.participantDisplayNames,
    room,
    roomError: roomQuery.isError
      ? {
          ...createChatRoomEntryErrorPresentation(roomQuery.error),
          onRetry: () => void roomQuery.refetch(),
        }
      : null,
  };
}

export function canLoadOlderChatRoomMessages({
  contextHasOlder,
  contextNavigationActive,
  hasNextPage,
  isHistoryEnabled,
  roomClosed,
}: Readonly<{
  contextHasOlder: boolean;
  contextNavigationActive: boolean;
  hasNextPage: boolean;
  isHistoryEnabled: boolean;
  roomClosed: boolean;
}>): boolean {
  return (
    isHistoryEnabled && !roomClosed && (contextNavigationActive ? contextHasOlder : hasNextPage)
  );
}

export function createChatRoomMessageNavigationFeedback(
  navigation: Pick<
    RoomMessageContextController,
    "error" | "isError" | "isPending" | "messages" | "purpose" | "targetMessageId"
  >,
): ChatMessageHistoryFeedback | null {
  const destination = navigation.purpose === "entry" ? "마지막으로 읽은 위치" : "대화 위치";

  if (navigation.isPending && navigation.messages.length === 0) {
    return {
      kind: "notice",
      message: `${destination}로 이동하고 있습니다.`,
    };
  }

  if (navigation.isError) {
    const presentation = createRoomMessageContextErrorPresentation(navigation.error);
    return {
      kind: "error",
      message: presentation.detail,
      title: `${destination}로 이동하지 못했습니다.`,
    };
  }

  if (navigation.targetMessageId !== null && navigation.messages.length === 0) {
    return {
      kind: "notice",
      message: "이동할 메시지를 찾지 못했습니다.",
    };
  }

  return null;
}

export function createChatRoomMessageHistoryFeedback({
  error,
  isHistoryEnabled,
  isError,
  isPending,
  hasSystemActivities = false,
  messageCount,
}: Readonly<{
  error: unknown;
  hasSystemActivities?: boolean;
  isHistoryEnabled: boolean;
  isError: boolean;
  isPending: boolean;
  messageCount: number;
}>): ChatMessageHistoryFeedback | null {
  const hasMessages = messageCount > 0 || hasSystemActivities;

  if (!isHistoryEnabled && !hasMessages) {
    return null;
  }

  if (isPending && !hasMessages) {
    return {
      kind: "notice",
      message: "최근 메시지를 불러오고 있습니다.",
    };
  }

  if (isError) {
    return {
      kind: "error",
      message: toChatRoomErrorMessage(error),
      title: "메시지 이력을 불러오지 못했습니다.",
    };
  }

  if (!hasMessages) {
    return {
      kind: "notice",
      message: "아직 작성된 메시지가 없습니다.",
    };
  }

  return null;
}

export function toChatRoomErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
