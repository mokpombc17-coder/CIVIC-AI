"use client";

import { useMemo } from "react";
import { createChatMessageReadReceiptPresentation } from "@/components/chat-message-read-receipt-presentation";
import type { ChatMessageMutationStates } from "@/components/chat-message-mutation-state";
import {
  createChatMessageViewportItemViewModels,
  type ChatMessageItemViewModel,
  type ChatMessageViewportItemViewModel,
} from "@/components/chat-room-view-model";
import {
  createChatMessageTimeline,
  createChatMessageTimelineRows,
} from "@/lib/chat/chat-message-timeline";
import type {
  ChatMessage,
  RoomMembershipListItem,
  RoomParticipationListItem,
} from "@/lib/chat/chat-room-contracts";
import type { ChatRoomReadReceiptState } from "@/lib/chat/chat-room-read-receipt-state";
import {
  createRoomParticipantDisplayNames,
  createRoomParticipationDisplayNames,
} from "@/lib/chat/chat-room-participant-profiles";
import type { ChatOutgoingMessage } from "@/lib/chat/realtime/chat-message-outbox";
import {
  combineChatRoomSystemActivities,
  createParticipationSystemActivities,
  type ChatRoomSystemActivity,
} from "@/lib/chat/realtime/chat-room-system-activity";
import type { ChatRoomReadReceiptSyncStatus } from "@/lib/chat/realtime/chat-room-read-receipt-coordinator";

export type ChatRoomMessagePresentation = Readonly<{
  messageItems: readonly ChatMessageItemViewModel[];
  participantDisplayNames: ReadonlyMap<string, string>;
  viewportItems: readonly ChatMessageViewportItemViewModel[];
}>;

type ChatRoomMessagePresentationInput = Readonly<{
  canMutateMessages?: boolean;
  confirmedMessages: readonly ChatMessage[];
  mutationStates: ChatMessageMutationStates;
  messageVisibleAfterSequence?: number;
  outgoingMessages: readonly ChatOutgoingMessage[];
  participantProfiles: readonly RoomMembershipListItem[];
  participationHistory?: readonly RoomParticipationListItem[];
  readBoundaryAfterSequence: number | null;
  receiptState: ChatRoomReadReceiptState | undefined;
  receiptSyncStatus: ChatRoomReadReceiptSyncStatus;
  roomId: string;
  selfMembershipId: string | null;
  systemActivities?: readonly ChatRoomSystemActivity[];
}>;

export function useChatRoomMessagePresentation({
  canMutateMessages = true,
  confirmedMessages,
  mutationStates,
  messageVisibleAfterSequence = 0,
  outgoingMessages,
  participantProfiles,
  participationHistory = [],
  readBoundaryAfterSequence,
  receiptState,
  receiptSyncStatus,
  roomId,
  selfMembershipId,
  systemActivities = [],
}: ChatRoomMessagePresentationInput): ChatRoomMessagePresentation {
  return useMemo(
    () =>
      createChatRoomMessagePresentation({
        canMutateMessages,
        confirmedMessages,
        mutationStates,
        messageVisibleAfterSequence,
        outgoingMessages,
        participantProfiles,
        participationHistory,
        readBoundaryAfterSequence,
        receiptState,
        receiptSyncStatus,
        roomId,
        selfMembershipId,
        systemActivities,
      }),
    [
      canMutateMessages,
      confirmedMessages,
      mutationStates,
      messageVisibleAfterSequence,
      outgoingMessages,
      participantProfiles,
      participationHistory,
      readBoundaryAfterSequence,
      receiptState,
      receiptSyncStatus,
      roomId,
      selfMembershipId,
      systemActivities,
    ],
  );
}

export function createChatRoomMessagePresentation({
  canMutateMessages = true,
  confirmedMessages,
  mutationStates,
  messageVisibleAfterSequence = 0,
  outgoingMessages,
  participantProfiles,
  participationHistory = [],
  readBoundaryAfterSequence,
  receiptState,
  receiptSyncStatus,
  roomId,
  selfMembershipId,
  systemActivities = [],
}: ChatRoomMessagePresentationInput): ChatRoomMessagePresentation {
  const participantDisplayNames = createRoomParticipantDisplayNames(participantProfiles);
  const participationDisplayNames = createRoomParticipationDisplayNames(participationHistory);
  const ownerMembershipId =
    participantProfiles.find((participant) => participant.role === "OWNER")?.membershipId ?? null;
  const readReceiptPresentation = createChatMessageReadReceiptPresentation({
    messages: confirmedMessages,
    receiptState,
    receiptSyncStatus,
    selfMembershipId,
  });
  const timeline = createChatMessageTimeline(confirmedMessages, outgoingMessages);
  const restoredActivities = createParticipationSystemActivities(
    roomId,
    participationHistory,
    selfMembershipId,
  );
  const timelineRows = createChatMessageTimelineRows(timeline, {
    readBoundaryAfterSequence,
    systemActivityStartAfterSequence: messageVisibleAfterSequence,
    systemActivities: combineChatRoomSystemActivities(restoredActivities, systemActivities),
  });
  const viewportItems = createChatMessageViewportItemViewModels(
    timelineRows,
    selfMembershipId,
    mutationStates,
    readReceiptPresentation.summaries,
    participantDisplayNames,
    ownerMembershipId,
    canMutateMessages,
    participationDisplayNames,
  );

  return {
    messageItems: viewportItems.flatMap((item) => (item.kind === "message" ? [item.item] : [])),
    participantDisplayNames,
    viewportItems,
  };
}
