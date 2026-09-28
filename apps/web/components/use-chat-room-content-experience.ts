"use client";

import { useCallback } from "react";
import {
  createChatRoomHeaderViewModel,
  type ChatMessageHistoryFeedback,
} from "@/components/chat-room-view-model";
import { useChatRoomMessageExperience } from "@/components/use-chat-room-message-experience";
import { useChatRoomReadExperience } from "@/components/use-chat-room-read-experience";
import type { ChatRoomRealtimeExperience } from "@/components/use-chat-room-realtime-experience";
import { useChatRoomParticipantProfiles } from "@/components/use-chat-room-screen-data";
import type { RoomMessageContextController } from "@/components/use-room-message-context";
import { useRoomDetailsQuery } from "@/lib/chat/chat-room-queries";
import { createChatRoomEntryErrorPresentation } from "@/lib/chat/chat-room-entry-error-presentation";
import { createRoomMessageContextErrorPresentation } from "@/lib/chat/chat-room-message-search-error-presentation";

export function useChatRoomContentExperience(
  roomId: string,
  roomQuery: ReturnType<typeof useRoomDetailsQuery>,
  realtime: ChatRoomRealtimeExperience,
  messageNavigation: RoomMessageContextController,
) {
  const { coordinator, messageHistory, receiptStateQuery, session } = realtime;
  const participantProfiles = useChatRoomParticipantProfiles(roomId, {
    enabled: realtime.messageHistoryEnabled,
  });
  const messageNavigationActive = messageNavigation.mode !== null;
  const contextNavigationActive = messageNavigation.mode === "context";
  const confirmedMessages = messageNavigationActive
    ? messageNavigation.messages
    : messageHistory.messages;
  const { fetchNextPage } = messageHistory;
  const room = roomQuery.data;
  const roomClosed = room?.status === "CLOSED";
  const latestConfirmedSequence = messageHistory.messages.at(-1)?.roomSequence ?? null;
  const read = useChatRoomReadExperience({
    connectionErrorCode: session.connectionError?.code ?? null,
    enabled: session.isActive,
    generation: session.generation,
    history: messageHistory.entryHistory,
    historyReady: messageHistory.status === "success",
    latestConfirmedSequence,
    loadOlder: messageHistory.loadOlderEntryHistory,
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
    readBoundaryAfterSequence: contextNavigationActive ? null : read.readBoundaryAfterSequence,
    receiptState: receiptStateQuery.data,
    receiptSyncStatus: coordinator.readReceiptStatus,
    roomId,
    selfMembershipId: room?.myMembership?.membershipId ?? null,
    systemActivities: messageNavigationActive ? [] : realtime.systemActivities,
  });
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
    messageHistory: {
      canLoadOlder: roomClosed || contextNavigationActive ? false : messageHistory.hasNextPage,
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
      initialScrollTarget:
        messageNavigationActive && messageNavigation.targetMessageId
          ? ({ kind: "message", messageId: messageNavigation.targetMessageId } as const)
          : messageNavigationActive
            ? ({ kind: "pending" } as const)
            : read.initialScrollTarget,
      isLoadingOlder: contextNavigationActive ? false : messageHistory.isFetchingNextPage,
      items: roomClosed ? [] : message.viewportItems,
      latestConfirmedSequence,
      onLoadOlder: loadOlder,
      onNavigateToLatest: messageNavigationActive ? messageNavigation.closeContext : null,
      onOpenMessageActions: message.actions.openMessageActions,
      onReadThroughSequence: read.onReadThroughSequence,
      onRetry: contextNavigationActive
        ? () => void messageNavigation.retry()
        : () => void messageHistory.refetch(),
      readStateEnabled: read.readStateEnabled && !contextNavigationActive,
      roomLabel: `${roomId} 메시지`,
      targetMessageId: messageNavigationActive ? messageNavigation.targetMessageId : null,
      viewportContinuityKey: messageNavigationActive
        ? `${roomId}:message-navigation:${messageNavigation.mode}:${messageNavigation.selectedMessageId}`
        : roomId,
      viewportKey: messageNavigationActive
        ? `${message.viewportKey}:message-navigation:${messageNavigation.mode}:${messageNavigation.selectedMessageId}`
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

export function createChatRoomMessageNavigationFeedback(
  navigation: Pick<
    RoomMessageContextController,
    "error" | "isError" | "isPending" | "messages" | "targetMessageId"
  >,
): ChatMessageHistoryFeedback | null {
  if (navigation.isPending && navigation.messages.length === 0) {
    return {
      kind: "notice",
      message: "대화 위치로 이동하고 있습니다.",
    };
  }

  if (navigation.isError) {
    const presentation = createRoomMessageContextErrorPresentation(navigation.error);
    return {
      kind: "error",
      message: presentation.detail,
      title: "대화 위치로 이동하지 못했습니다.",
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
    return {
      kind: "notice",
      message: "실시간 방 구독이 준비되면 최근 메시지를 불러옵니다.",
    };
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
