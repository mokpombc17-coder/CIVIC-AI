"use client";

import {
  useChatRealtimeConnection,
  useChatRealtimeRoom,
} from "@/components/chat-realtime-provider";
import { useChatRealtimeQueryCoordinator } from "@/components/use-chat-realtime-query-coordinator";
import { useChatRoomMessageHistoryData } from "@/components/use-chat-room-screen-data";
import {
  DEFAULT_MESSAGE_HISTORY_LIMIT,
  useRoomReadReceiptStateQuery,
} from "@/lib/chat/chat-room-queries";
import { isChatRoomSnapshotReadyForRealtimeMerge } from "@/lib/chat/realtime/chat-room-snapshot-readiness";
import { getChatRoomSessionView } from "@/lib/chat/realtime/chat-room-session-view";

export function useChatRoomRealtimeExperience(roomId: string) {
  const { reconnect } = useChatRealtimeConnection();
  const session = useChatRealtimeRoom(roomId);
  const messageHistory = useChatRoomMessageHistoryData(roomId, {
    enabled: session.isActive,
  });
  const receiptStateQuery = useRoomReadReceiptStateQuery(roomId, {
    enabled: session.isActive,
    generation: session.generation,
  });
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
    receiptStateQuery,
    reconnect,
    realtimeReady,
    session,
    sessionView: getChatRoomSessionView(session, roomId, realtimeReady),
  };
}

export type ChatRoomRealtimeExperience = ReturnType<typeof useChatRoomRealtimeExperience>;

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
