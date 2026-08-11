"use client";

import { useEffect } from "react";
import { useChatMessageOutbox, useChatOutgoingMessages } from "@/components/chat-realtime-provider";
import {
  ChatRoomScreenHeaderActions,
  ChatRoomScreenOverlay,
  resolveChatRoomScreenOverlayKind,
} from "@/components/chat-room-screen-overlays";
import { ChatRoomSessionControls } from "@/components/chat-room-session-controls";
import {
  ChatRoomSessionIndicator,
  ChatRoomSessionNotice,
} from "@/components/chat-room-session-status";
import { createChatRoomHeaderViewModel } from "@/components/chat-room-view-model";
import { ChatRoomView, type ChatMessageHistoryFeedback } from "@/components/chat-room-view";
import { ChatRealtimeSyncStatus } from "@/components/chat-realtime-sync-status";
import { useChatMessageMutations } from "@/components/use-chat-message-mutations";
import { useChatMessageActionsBottomSheet } from "@/components/use-chat-message-actions-bottom-sheet";
import { useChatRoomMembershipDialog } from "@/components/use-chat-room-membership-dialog";
import { useChatRoomMessageSearchExperience } from "@/components/use-chat-room-message-search-experience";
import { useChatRoomMessagePresentation } from "@/components/use-chat-room-message-presentation";
import { useChatRoomReadExperience } from "@/components/use-chat-room-read-experience";
import { useChatRoomRealtimeExperience } from "@/components/use-chat-room-realtime-experience";
import { useChatRoomParticipantProfiles } from "@/components/use-chat-room-screen-data";
import { useRoomDetailsQuery } from "@/lib/chat/chat-room-queries";

export function ChatRoomScreen({ roomId }: { roomId: string }) {
  const outbox = useChatMessageOutbox();
  const outgoingMessages = useChatOutgoingMessages(roomId);
  const realtime = useChatRoomRealtimeExperience(roomId);
  const { coordinator, coordinatorEnabled, messageHistory, receiptStateQuery, session } = realtime;
  const {
    close: closeMembershipDialog,
    isOpen: isMembershipDialogOpen,
    open: openMembershipDialog,
    triggerRef: membershipDialogTriggerRef,
  } = useChatRoomMembershipDialog(roomId);
  const messageSearchExperience = useChatRoomMessageSearchExperience(roomId, {
    generation: session.generation,
    roomActive: session.isActive,
  });
  const messageMutations = useChatMessageMutations({
    enabled: session.isActive,
    generation: session.generation,
    roomId,
  });
  const roomQuery = useRoomDetailsQuery(roomId);
  const participantProfiles = useChatRoomParticipantProfiles(roomId, {
    enabled: session.isActive,
  });
  const room = roomQuery.data;
  const latestConfirmedSequence = messageHistory.messages.at(-1)?.roomSequence ?? null;
  const readExperience = useChatRoomReadExperience({
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
  const { messageItems, participantDisplayNames, viewportItems } = useChatRoomMessagePresentation({
    confirmedMessages: messageHistory.messages,
    mutationStates: messageMutations.states,
    outgoingMessages,
    participantProfiles,
    readBoundaryAfterSequence: readExperience.readBoundaryAfterSequence,
    receiptState: receiptStateQuery.data,
    receiptSyncStatus: coordinator.readReceiptStatus,
    selfMembershipId: room?.myMembership?.membershipId ?? null,
  });
  const viewportKey = `${roomId}:${session.generation}`;
  const messageActions = useChatMessageActionsBottomSheet({
    items: messageItems,
    onDeleteMessage: messageMutations.deleteMessage,
    onEditMessage: messageMutations.editMessage,
    viewportKey,
  });
  const overlayKind = resolveChatRoomScreenOverlayKind({
    hasMessageActions: messageActions.sheet !== null,
    isMembershipDialogOpen,
    isMessageSearchDialogOpen: messageSearchExperience.isOpen,
    roomAvailable: room !== undefined,
  });
  const header = createChatRoomHeaderViewModel({
    memberCount: room?.activeMemberCount,
    name: room?.name,
    participationStatus: room?.participationStatus,
    roomId,
    roomStatus: room?.status,
    status: roomQuery.status,
  });
  const feedback = createMessageHistoryFeedback({
    error: messageHistory.error,
    isActive: session.isActive,
    isError: messageHistory.isError && !messageHistory.isFetchNextPageError,
    isPending: messageHistory.isPending,
    messageCount: messageItems.length,
  });
  useEffect(() => {
    outbox.acknowledgeConfirmed(
      roomId,
      new Set(messageHistory.messages.map((message) => message.clientMessageId)),
    );
  }, [messageHistory.messages, outbox, roomId]);

  return (
    <ChatRoomView
      header={header}
      headerAction={
        <ChatRoomScreenHeaderActions
          isMembershipDialogOpen={isMembershipDialogOpen}
          isMessageSearchDialogOpen={messageSearchExperience.isOpen}
          membershipDialogTriggerRef={membershipDialogTriggerRef}
          messageSearchDialogTriggerRef={messageSearchExperience.triggerRef}
          onOpenMembershipDialog={openMembershipDialog}
          onOpenMessageSearchDialog={messageSearchExperience.open}
          roomAvailable={room !== undefined}
          searchDisabled={!session.isActive}
        />
      }
      messageHistory={{
        canLoadOlder: messageHistory.hasNextPage,
        entryNavigation: readExperience.entryNavigationNotice,
        feedback,
        initialScrollTarget: readExperience.initialScrollTarget,
        isLoadingOlder: messageHistory.isFetchingNextPage,
        items: viewportItems,
        latestConfirmedSequence,
        onLoadOlder: async () => {
          const result = await messageHistory.fetchNextPage();

          if (result.isError) {
            throw result.error;
          }

          return {
            hasOlderMessages: result.hasNextPage,
          };
        },
        onOpenMessageActions: messageActions.openMessageActions,
        onReadThroughSequence: readExperience.onReadThroughSequence,
        onRetry: () => void messageHistory.refetch(),
        readStateEnabled: readExperience.readStateEnabled,
        roomLabel: `${roomId} 메시지`,
        viewportKey,
      }}
      overlay={
        overlayKind ? (
          <ChatRoomScreenOverlay
            kind={overlayKind}
            membershipDialog={{
              isOpen: isMembershipDialogOpen,
              onClose: closeMembershipDialog,
            }}
            messageActionsSheet={messageActions.sheet}
            messageSearchDialog={{
              context: messageSearchExperience.context,
              controller: messageSearchExperience.controller,
              isOpen: messageSearchExperience.isOpen,
              onClose: messageSearchExperience.close,
            }}
            participantDisplayNames={participantDisplayNames}
            room={room}
            roomId={roomId}
          />
        ) : null
      }
      roomError={
        roomQuery.isError
          ? {
              message: toErrorMessage(roomQuery.error),
              onRetry: () => void roomQuery.refetch(),
            }
          : null
      }
      sessionIndicator={<ChatRoomSessionIndicator view={realtime.sessionView} />}
      sessionNotice={
        <ChatRoomSessionNotice
          onReactivate={session.reactivate}
          onReconnect={realtime.reconnect}
          view={realtime.sessionView}
        />
      }
      sessionControls={<ChatRoomSessionControls roomId={roomId} view={realtime.sessionView} />}
      syncStatus={
        <ChatRealtimeSyncStatus
          error={coordinator.error}
          onRetry={coordinator.retry}
          visible={coordinatorEnabled}
        />
      }
    />
  );
}

function createMessageHistoryFeedback({
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
      message: toErrorMessage(error),
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

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
