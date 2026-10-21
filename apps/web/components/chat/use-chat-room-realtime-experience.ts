"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  useChatRealtimeConnection,
  useChatRealtimeRoom,
} from "@/components/chat/chat-realtime-provider";
import { useChatRealtimeQueryCoordinator } from "@/components/chat/use-chat-realtime-query-coordinator";
import { useChatRoomMessageHistoryData } from "@/components/chat/use-chat-room-screen-data";
import {
  chatRoomQueryKeys,
  DEFAULT_MESSAGE_HISTORY_LIMIT,
  useRoomParticipationsQuery,
  useRoomReadReceiptStateQuery,
  useRoomSystemActivityJournalQuery,
} from "@/lib/chat/chat-room-queries";
import type { RoomParticipationListResponse, RoomStatus } from "@/lib/chat/chat-room-contracts";
import { isChatRoomSnapshotReadyForRealtimeMerge } from "@/lib/chat/realtime/chat-room-snapshot-readiness";
import { getChatRoomSessionView } from "@/lib/chat/realtime/chat-room-session-view";

export function useChatRoomRealtimeExperience(
  roomId: string,
  { roomStatus }: Readonly<{ roomStatus?: RoomStatus | undefined }> = {},
) {
  const queryClient = useQueryClient();
  const { reconnect } = useChatRealtimeConnection();
  const realtimeEnabled = isChatRoomRealtimeEnabled(roomStatus);
  const session = useChatRealtimeRoom(roomId, { enabled: realtimeEnabled });
  const messageHistoryEnabled = isChatRoomMessageHistoryEnabled(roomStatus, session.isActive);
  const messageHistory = useChatRoomMessageHistoryData(roomId, {
    enabled: messageHistoryEnabled,
  });
  const receiptStateQuery = useRoomReadReceiptStateQuery(roomId, {
    enabled: session.isActive,
    generation: session.generation,
  });
  const participationQuery = useRoomParticipationsQuery(roomId, {
    enabled: session.isActive,
    generation: session.generation,
  });
  const systemActivityJournalQuery = useRoomSystemActivityJournalQuery(roomId);
  const participationHistory = getLatestCachedRoomParticipationHistory(queryClient, roomId);
  const coordinatorEnabled = isChatRoomRealtimeCoordinatorEnabled({
    hasMessageHistory: messageHistory.data !== undefined,
    isMessageHistoryRefetching: messageHistory.isRefetching,
    isRoomActive: session.isActive,
    messageHistoryStatus: messageHistory.status,
    messageVisibleAfterSequence: session.messageVisibleAfterSequence,
    watermarkSequence: session.watermarkSequence,
  });
  const coordinator = useChatRealtimeQueryCoordinator({
    enabled: coordinatorEnabled,
    roomId,
    generation: session.generation,
    limit: DEFAULT_MESSAGE_HISTORY_LIMIT,
    messageVisibleAfterSequence: session.messageVisibleAfterSequence ?? 0,
    watermarkSequence: session.watermarkSequence ?? 0,
  });
  const realtimeReady = isChatRoomRealtimeReady({
    coordinatorEnabled,
    coordinatorError: coordinator.error,
    isSynchronized: coordinator.isSynchronized,
  });

  return {
    coordinator,
    coordinatorEnabled,
    messageHistory,
    messageHistoryEnabled,
    participationHistory,
    participationQuery,
    receiptStateQuery,
    reconnect,
    realtimeReady,
    session,
    sessionView: getChatRoomSessionView(session, roomId, realtimeReady, roomStatus),
    systemActivities: systemActivityJournalQuery.data?.activities ?? [],
  };
}

export type ChatRoomRealtimeExperience = ReturnType<typeof useChatRoomRealtimeExperience>;

export function isChatRoomRealtimeEnabled(roomStatus?: RoomStatus): boolean {
  return roomStatus === "ACTIVE";
}

export function isChatRoomMessageHistoryEnabled(
  roomStatus: RoomStatus | undefined,
  isRoomActive: boolean,
): boolean {
  return roomStatus === "ACTIVE" && isRoomActive;
}

export function isChatRoomRealtimeCoordinatorEnabled({
  hasMessageHistory,
  isMessageHistoryRefetching,
  isRoomActive,
  messageHistoryStatus,
  messageVisibleAfterSequence,
  watermarkSequence,
}: Readonly<{
  hasMessageHistory: boolean;
  isMessageHistoryRefetching: boolean;
  isRoomActive: boolean;
  messageHistoryStatus: "pending" | "error" | "success";
  messageVisibleAfterSequence: number | null;
  watermarkSequence: number | null;
}>): boolean {
  return (
    messageVisibleAfterSequence !== null &&
    watermarkSequence !== null &&
    isChatRoomSnapshotReadyForRealtimeMerge({
      hasMessageHistory,
      isMessageHistoryRefetching,
      isRoomActive,
      messageHistoryStatus,
    })
  );
}

export function isChatRoomRealtimeReady({
  coordinatorEnabled,
  coordinatorError,
  isSynchronized,
}: Readonly<{
  coordinatorEnabled: boolean;
  coordinatorError: Error | null;
  isSynchronized: boolean;
}>): boolean {
  return coordinatorEnabled && isSynchronized && coordinatorError === null;
}

export function getLatestCachedRoomParticipationHistory(
  queryClient: QueryClient,
  roomId: string,
): RoomParticipationListResponse["items"] {
  let latestData: RoomParticipationListResponse | undefined;
  let latestUpdatedAt = -1;

  for (const query of queryClient.getQueryCache().findAll({
    queryKey: chatRoomQueryKeys.participationsForRoom(roomId),
  })) {
    const data = query.state.data as RoomParticipationListResponse | undefined;

    if (data === undefined || query.state.dataUpdatedAt < latestUpdatedAt) {
      continue;
    }

    latestData = data;
    latestUpdatedAt = query.state.dataUpdatedAt;
  }

  return latestData?.items ?? [];
}
