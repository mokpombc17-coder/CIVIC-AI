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
import type { ChatMessage, RoomMembershipListItem } from "@/lib/chat/chat-room-contracts";
import type { ChatRoomReadReceiptState } from "@/lib/chat/chat-room-read-receipt-state";
import { createRoomParticipantDisplayNames } from "@/lib/chat/chat-room-participant-profiles";
import type { ChatOutgoingMessage } from "@/lib/chat/realtime/chat-message-outbox";
import type { ChatRoomReadReceiptSyncStatus } from "@/lib/chat/realtime/chat-room-read-receipt-coordinator";

export type ChatRoomMessagePresentation = Readonly<{
  messageItems: readonly ChatMessageItemViewModel[];
  participantDisplayNames: ReadonlyMap<string, string>;
  viewportItems: readonly ChatMessageViewportItemViewModel[];
}>;

type ChatRoomMessagePresentationInput = Readonly<{
  confirmedMessages: readonly ChatMessage[];
  mutationStates: ChatMessageMutationStates;
  outgoingMessages: readonly ChatOutgoingMessage[];
  participantProfiles: readonly RoomMembershipListItem[];
  readBoundaryAfterSequence: number | null;
  receiptState: ChatRoomReadReceiptState | undefined;
  receiptSyncStatus: ChatRoomReadReceiptSyncStatus;
  selfMembershipId: string | null;
}>;

export function useChatRoomMessagePresentation({
  confirmedMessages,
  mutationStates,
  outgoingMessages,
  participantProfiles,
  readBoundaryAfterSequence,
  receiptState,
  receiptSyncStatus,
  selfMembershipId,
}: ChatRoomMessagePresentationInput): ChatRoomMessagePresentation {
  return useMemo(
    () =>
      createChatRoomMessagePresentation({
        confirmedMessages,
        mutationStates,
        outgoingMessages,
        participantProfiles,
        readBoundaryAfterSequence,
        receiptState,
        receiptSyncStatus,
        selfMembershipId,
      }),
    [
      confirmedMessages,
      mutationStates,
      outgoingMessages,
      participantProfiles,
      readBoundaryAfterSequence,
      receiptState,
      receiptSyncStatus,
      selfMembershipId,
    ],
  );
}

export function createChatRoomMessagePresentation({
  confirmedMessages,
  mutationStates,
  outgoingMessages,
  participantProfiles,
  readBoundaryAfterSequence,
  receiptState,
  receiptSyncStatus,
  selfMembershipId,
}: ChatRoomMessagePresentationInput): ChatRoomMessagePresentation {
  const participantDisplayNames = createRoomParticipantDisplayNames(participantProfiles);
  const readReceiptPresentation = createChatMessageReadReceiptPresentation({
    messages: confirmedMessages,
    receiptState,
    receiptSyncStatus,
    selfMembershipId,
  });
  const timeline = createChatMessageTimeline(confirmedMessages, outgoingMessages);
  const timelineRows = createChatMessageTimelineRows(timeline, {
    readBoundaryAfterSequence,
  });
  const viewportItems = createChatMessageViewportItemViewModels(
    timelineRows,
    selfMembershipId,
    mutationStates,
    readReceiptPresentation.summaries,
    participantDisplayNames,
  );

  return {
    messageItems: viewportItems.flatMap((item) => (item.kind === "message" ? [item.item] : [])),
    participantDisplayNames,
    viewportItems,
  };
}
