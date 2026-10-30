"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  createChatRoomEntryNavigationNotice,
  type ChatRoomEntryNavigationNoticeViewModel,
} from "@/components/chat/chat-room-entry-navigation-notice";
import type { ChatMessageViewportInitialScrollTarget } from "@/components/chat/chat-message-viewport-state";
import { useChatRoomEntryNavigation } from "@/components/chat/use-chat-room-entry-navigation";
import { useChatRoomReadState } from "@/components/chat/use-chat-room-read-state";
import type { ChatRoomEntryHistoryPageState } from "@/lib/chat/chat-room-entry-history";
import type { ChatMessage } from "@/lib/chat/chat-room-contracts";
import { resolveChatRoomStoredReadSequence } from "@/lib/chat/chat-room-entry-read-position";
import type {
  RoomMembership,
  RoomParticipationStatus,
  RoomStatus,
} from "@/lib/chat/chat-room-contracts";
import type { ChatRoomReadReceiptState } from "@/lib/chat/chat-room-read-receipt-state";
import type { ChatRoomReadStateCancellationReason } from "@/lib/chat/chat-room-read-state-coordinator";
import { getChatRoomReadStateMembershipLifecycle } from "@/lib/chat/chat-room-read-state-membership-lifecycle";

export type ChatRoomReadExperience = Readonly<{
  entryNavigationNotice: ChatRoomEntryNavigationNoticeViewModel | null;
  initialScrollTarget: ChatMessageViewportInitialScrollTarget;
  onReadThroughSequence: (throughSequence: number) => void;
  readBoundaryAfterSequence: number | null;
  readStateEnabled: boolean;
}>;

type UseChatRoomReadExperienceOptions = Readonly<{
  connectionErrorCode: string | null;
  enabled: boolean;
  generation: number;
  history: ChatRoomEntryHistoryPageState;
  historyReady: boolean;
  latestConfirmedSequence: number | null;
  loadFirstUnreadMessage: (afterSequence: number) => Promise<ChatMessage | null>;
  onJumpToMessage: (messageId: string) => void;
  membership: RoomMembership | null;
  messageVisibleAfterSequence: number | null;
  onRefetchReceiptState: () => void;
  onRefetchRoom: () => void;
  participationStatus: RoomParticipationStatus | undefined;
  readStateReady: boolean;
  receiptState: ChatRoomReadReceiptState | undefined;
  receiptStateReady: boolean;
  receiptStateUnavailable: boolean;
  roomErrorCode: string | null;
  roomId: string;
  roomStatus: RoomStatus | undefined;
}>;

export function useChatRoomReadExperience({
  connectionErrorCode,
  enabled,
  generation,
  history,
  historyReady,
  latestConfirmedSequence,
  loadFirstUnreadMessage,
  onJumpToMessage,
  membership,
  messageVisibleAfterSequence,
  onRefetchReceiptState,
  onRefetchRoom,
  participationStatus,
  readStateReady,
  receiptState,
  receiptStateReady,
  receiptStateUnavailable,
  roomErrorCode,
  roomId,
  roomStatus,
}: UseChatRoomReadExperienceOptions): ChatRoomReadExperience {
  const entryNavigation = useChatRoomEntryNavigation({
    enabled,
    generation,
    history,
    historyReady,
    latestConfirmedSequence,
    loadFirstUnreadMessage,
    onJumpToMessage,
    receiptState,
    receiptStateReady,
    receiptStateUnavailable,
    roomId,
    selfMembershipId: membership?.membershipId ?? null,
  });
  const readStateEnabled = enabled && readStateReady && entryNavigation.canReportReadState;
  const membershipLifecycle = useMemo(
    () =>
      getChatRoomReadStateMembershipLifecycle({
        enabled: readStateEnabled,
        membership,
        messageVisibleAfterSequence,
      }),
    [membership, messageVisibleAfterSequence, readStateEnabled],
  );
  const terminalReason = resolveChatRoomReadStateTerminalReason({
    connectionErrorCode,
    participationStatus,
    roomErrorCode,
    roomStatus,
  });
  const onReadThroughSequence = useChatRoomReadState(roomId, {
    activeGeneration: readStateEnabled ? generation : null,
    membershipLifecycle,
    storedReadSequence: resolveChatRoomStoredReadSequence({
      receiptState,
      roomId,
      selfMembershipId: membership?.membershipId ?? null,
    }),
    terminalReason,
  });

  useReceiptMembershipMismatchRecovery({
    generation,
    membershipId: membership?.membershipId ?? null,
    onRefetchReceiptState,
    onRefetchRoom,
    receiptState,
  });

  return {
    entryNavigationNotice: createChatRoomEntryNavigationNotice(entryNavigation),
    initialScrollTarget: entryNavigation.initialScrollTarget,
    onReadThroughSequence,
    readBoundaryAfterSequence: entryNavigation.readBoundaryAfterSequence,
    readStateEnabled,
  };
}

export function resolveChatRoomReadStateTerminalReason({
  connectionErrorCode,
  participationStatus,
  roomErrorCode,
  roomStatus,
}: Readonly<{
  connectionErrorCode: string | null;
  participationStatus: RoomParticipationStatus | undefined;
  roomErrorCode: string | null;
  roomStatus: RoomStatus | undefined;
}>): ChatRoomReadStateCancellationReason | null {
  if (connectionErrorCode === "ROOM_ACCESS_REVOKED") {
    return "ACCESS_REVOKED";
  }

  if (
    connectionErrorCode === "ROOM_CLOSED" ||
    roomErrorCode === "ROOM_CLOSED" ||
    roomStatus === "CLOSED" ||
    participationStatus === "ROOM_CLOSED"
  ) {
    return "ROOM_CLOSED";
  }

  return participationStatus === "LEFT" ||
    participationStatus === "BANNED" ||
    participationStatus === "NOT_JOINED"
    ? participationStatus
    : null;
}

function useReceiptMembershipMismatchRecovery({
  generation,
  membershipId,
  onRefetchReceiptState,
  onRefetchRoom,
  receiptState,
}: Readonly<{
  generation: number;
  membershipId: string | null;
  onRefetchReceiptState: () => void;
  onRefetchRoom: () => void;
  receiptState: ChatRoomReadReceiptState | undefined;
}>): void {
  const recoveredMismatchKeyRef = useRef<string | null>(null);
  const mismatchKey = createReceiptMembershipMismatchRecoveryKey({
    generation,
    membershipId,
    receiptState,
  });

  useEffect(() => {
    if (mismatchKey === null) {
      recoveredMismatchKeyRef.current = null;
      return;
    }

    if (recoveredMismatchKeyRef.current === mismatchKey) {
      return;
    }

    recoveredMismatchKeyRef.current = mismatchKey;
    onRefetchRoom();
    onRefetchReceiptState();
  }, [mismatchKey, onRefetchReceiptState, onRefetchRoom]);
}

export function createReceiptMembershipMismatchRecoveryKey({
  generation,
  membershipId,
  receiptState,
}: Readonly<{
  generation: number;
  membershipId: string | null;
  receiptState: ChatRoomReadReceiptState | undefined;
}>): string | null {
  return membershipId !== null &&
    receiptState !== undefined &&
    receiptState.selfMembershipId !== membershipId
    ? `${generation}:${membershipId}:${receiptState.selfMembershipId}`
    : null;
}
