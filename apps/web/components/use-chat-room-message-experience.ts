"use client";

import { useEffect } from "react";
import { useChatMessageOutbox, useChatOutgoingMessages } from "@/components/chat-realtime-provider";
import { useChatMessageActionsBottomSheet } from "@/components/use-chat-message-actions-bottom-sheet";
import { useChatMessageMutations } from "@/components/use-chat-message-mutations";
import { useChatRoomMessagePresentation } from "@/components/use-chat-room-message-presentation";
import type { ChatMessage, RoomMembershipListItem } from "@/lib/chat/chat-room-contracts";
import type { ChatRoomReadReceiptState } from "@/lib/chat/chat-room-read-receipt-state";
import type { ChatRoomReadReceiptSyncStatus } from "@/lib/chat/realtime/chat-room-read-receipt-coordinator";

type ChatRoomMessageExperienceInput = Readonly<{
  confirmedMessages: readonly ChatMessage[];
  enabled: boolean;
  generation: number;
  includeOutgoingMessages?: boolean;
  participantProfiles: readonly RoomMembershipListItem[];
  readBoundaryAfterSequence: number | null;
  receiptState: ChatRoomReadReceiptState | undefined;
  receiptSyncStatus: ChatRoomReadReceiptSyncStatus;
  roomId: string;
  selfMembershipId: string | null;
}>;

export function useChatRoomMessageExperience({
  confirmedMessages,
  enabled,
  generation,
  includeOutgoingMessages = true,
  participantProfiles,
  readBoundaryAfterSequence,
  receiptState,
  receiptSyncStatus,
  roomId,
  selfMembershipId,
}: ChatRoomMessageExperienceInput) {
  const outbox = useChatMessageOutbox();
  const outgoingMessages = useChatOutgoingMessages(roomId);
  const mutations = useChatMessageMutations({
    enabled,
    generation,
    roomId,
  });
  const presentation = useChatRoomMessagePresentation({
    confirmedMessages,
    mutationStates: mutations.states,
    outgoingMessages: includeOutgoingMessages ? outgoingMessages : [],
    participantProfiles,
    readBoundaryAfterSequence,
    receiptState,
    receiptSyncStatus,
    selfMembershipId,
  });
  const viewportKey = createChatRoomViewportKey(roomId, generation);
  const actions = useChatMessageActionsBottomSheet({
    items: presentation.messageItems,
    onDeleteMessage: mutations.deleteMessage,
    onEditMessage: mutations.editMessage,
    viewportKey,
  });

  useEffect(() => {
    outbox.acknowledgeConfirmed(roomId, collectConfirmedClientMessageIds(confirmedMessages));
  }, [confirmedMessages, outbox, roomId]);

  return {
    actions,
    mutations,
    ...presentation,
    viewportKey,
  };
}

export function collectConfirmedClientMessageIds(
  messages: readonly Pick<ChatMessage, "clientMessageId">[],
): ReadonlySet<string> {
  return new Set(messages.map((message) => message.clientMessageId));
}

export function createChatRoomViewportKey(roomId: string, generation: number): string {
  return `${roomId}:${generation}`;
}
