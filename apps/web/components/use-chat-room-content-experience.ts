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
import { useRoomDetailsQuery } from "@/lib/chat/chat-room-queries";

export function useChatRoomContentExperience(roomId: string, realtime: ChatRoomRealtimeExperience) {
  const { coordinator, messageHistory, receiptStateQuery, session } = realtime;
  const roomQuery = useRoomDetailsQuery(roomId);
  const participantProfiles = useChatRoomParticipantProfiles(roomId, {
    enabled: session.isActive,
  });
  const { fetchNextPage } = messageHistory;
  const room = roomQuery.data;
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
    confirmedMessages: messageHistory.messages,
    enabled: session.isActive,
    generation: session.generation,
    participantProfiles,
    readBoundaryAfterSequence: read.readBoundaryAfterSequence,
    receiptState: receiptStateQuery.data,
    receiptSyncStatus: coordinator.readReceiptStatus,
    roomId,
    selfMembershipId: room?.myMembership?.membershipId ?? null,
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
      canLoadOlder: messageHistory.hasNextPage,
      entryNavigation: read.entryNavigationNotice,
      feedback: createChatRoomMessageHistoryFeedback({
        error: messageHistory.error,
        isActive: session.isActive,
        isError: messageHistory.isError && !messageHistory.isFetchNextPageError,
        isPending: messageHistory.isPending,
        messageCount: message.messageItems.length,
      }),
      initialScrollTarget: read.initialScrollTarget,
      isLoadingOlder: messageHistory.isFetchingNextPage,
      items: message.viewportItems,
      latestConfirmedSequence,
      onLoadOlder: loadOlder,
      onOpenMessageActions: message.actions.openMessageActions,
      onReadThroughSequence: read.onReadThroughSequence,
      onRetry: () => void messageHistory.refetch(),
      readStateEnabled: read.readStateEnabled,
      roomLabel: `${roomId} 메시지`,
      viewportKey: message.viewportKey,
    },
    participantDisplayNames: message.participantDisplayNames,
    room,
    roomError: roomQuery.isError
      ? {
          message: toChatRoomErrorMessage(roomQuery.error),
          onRetry: () => void roomQuery.refetch(),
        }
      : null,
  };
}

export function createChatRoomMessageHistoryFeedback({
  error,
  isActive,
  isError,
  isPending,
  messageCount,
}: Readonly<{
  error: unknown;
  isActive: boolean;
  isError: boolean;
  isPending: boolean;
  messageCount: number;
}>): ChatMessageHistoryFeedback | null {
  const hasMessages = messageCount > 0;

  if (!isActive && !hasMessages) {
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
