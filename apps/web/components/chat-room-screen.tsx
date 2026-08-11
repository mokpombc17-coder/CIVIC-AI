"use client";

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
import { useChatRoomMembershipDialog } from "@/components/use-chat-room-membership-dialog";
import { useChatRoomMessageExperience } from "@/components/use-chat-room-message-experience";
import { useChatRoomMessageSearchExperience } from "@/components/use-chat-room-message-search-experience";
import { useChatRoomReadExperience } from "@/components/use-chat-room-read-experience";
import { useChatRoomRealtimeExperience } from "@/components/use-chat-room-realtime-experience";
import { useChatRoomParticipantProfiles } from "@/components/use-chat-room-screen-data";
import { useRoomDetailsQuery } from "@/lib/chat/chat-room-queries";

export function ChatRoomScreen({ roomId }: { roomId: string }) {
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
  const messageExperience = useChatRoomMessageExperience({
    confirmedMessages: messageHistory.messages,
    enabled: session.isActive,
    generation: session.generation,
    participantProfiles,
    readBoundaryAfterSequence: readExperience.readBoundaryAfterSequence,
    receiptState: receiptStateQuery.data,
    receiptSyncStatus: coordinator.readReceiptStatus,
    roomId,
    selfMembershipId: room?.myMembership?.membershipId ?? null,
  });
  const overlayKind = resolveChatRoomScreenOverlayKind({
    hasMessageActions: messageExperience.actions.sheet !== null,
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
    messageCount: messageExperience.messageItems.length,
  });

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
        items: messageExperience.viewportItems,
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
        onOpenMessageActions: messageExperience.actions.openMessageActions,
        onReadThroughSequence: readExperience.onReadThroughSequence,
        onRetry: () => void messageHistory.refetch(),
        readStateEnabled: readExperience.readStateEnabled,
        roomLabel: `${roomId} 메시지`,
        viewportKey: messageExperience.viewportKey,
      }}
      overlay={
        overlayKind ? (
          <ChatRoomScreenOverlay
            kind={overlayKind}
            membershipDialog={{
              isOpen: isMembershipDialogOpen,
              onClose: closeMembershipDialog,
            }}
            messageActionsSheet={messageExperience.actions.sheet}
            messageSearchDialog={{
              context: messageSearchExperience.context,
              controller: messageSearchExperience.controller,
              isOpen: messageSearchExperience.isOpen,
              onClose: messageSearchExperience.close,
            }}
            participantDisplayNames={messageExperience.participantDisplayNames}
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
