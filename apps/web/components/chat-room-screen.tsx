"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { ChatMessageActionsBottomSheet } from "@/components/chat-message-actions-bottom-sheet";
import { createChatMessageReadReceiptPresentation } from "@/components/chat-message-read-receipt-presentation";
import {
  useChatMessageOutbox,
  useChatOutgoingMessages,
  useChatRealtimeConnection,
  useChatRealtimeRoom,
} from "@/components/chat-realtime-provider";
import {
  ChatRoomMembershipDialog,
  ChatRoomMembershipDialogTrigger,
} from "@/components/chat-room-membership-dialog";
import {
  ChatRoomMessageSearchDialog,
  ChatRoomMessageSearchDialogTrigger,
} from "@/components/chat-room-message-search-dialog";
import { createChatRoomEntryNavigationNotice } from "@/components/chat-room-entry-navigation-notice";
import { ChatRoomSessionControls } from "@/components/chat-room-session-controls";
import {
  ChatRoomSessionIndicator,
  ChatRoomSessionNotice,
} from "@/components/chat-room-session-status";
import {
  createChatMessageViewportItemViewModels,
  createChatRoomHeaderViewModel,
} from "@/components/chat-room-view-model";
import { ChatRoomView, type ChatMessageHistoryFeedback } from "@/components/chat-room-view";
import { ChatRealtimeSyncStatus } from "@/components/chat-realtime-sync-status";
import { useChatRealtimeQueryCoordinator } from "@/components/use-chat-realtime-query-coordinator";
import {
  createChatMessageTimeline,
  createChatMessageTimelineRows,
} from "@/lib/chat/chat-message-timeline";
import { useChatMessageMutations } from "@/components/use-chat-message-mutations";
import { useChatMessageActionsBottomSheet } from "@/components/use-chat-message-actions-bottom-sheet";
import { useChatRoomReadState } from "@/components/use-chat-room-read-state";
import { useChatRoomEntryNavigation } from "@/components/use-chat-room-entry-navigation";
import { useChatRoomMembershipDialog } from "@/components/use-chat-room-membership-dialog";
import { useChatRoomMessageSearchDialog } from "@/components/use-chat-room-message-search-dialog";
import { useRoomMessageContext } from "@/components/use-room-message-context";
import { useRoomMessageSearch } from "@/components/use-room-message-search";
import type { ChatRoomReadStateCancellationReason } from "@/lib/chat/chat-room-read-state-coordinator";
import { getChatRoomReadStateMembershipLifecycle } from "@/lib/chat/chat-room-read-state-membership-lifecycle";
import {
  createRoomParticipantDisplayNames,
  ROOM_PARTICIPANT_PROFILE_PAGE_LIMIT,
} from "@/lib/chat/chat-room-participant-profiles";
import {
  DEFAULT_MESSAGE_HISTORY_LIMIT,
  flattenRoomMessageHistoryPages,
  useRoomDetailsQuery,
  useRoomMembershipsQuery,
  useRoomMessageHistoryQuery,
  useRoomReadReceiptStateQuery,
} from "@/lib/chat/chat-room-queries";
import { isChatRoomSnapshotReadyForRealtimeMerge } from "@/lib/chat/realtime/chat-room-snapshot-readiness";
import { getChatRoomSessionView } from "@/lib/chat/realtime/chat-room-session-view";

export function ChatRoomScreen({ roomId }: { roomId: string }) {
  const outbox = useChatMessageOutbox();
  const outgoingMessages = useChatOutgoingMessages(roomId);
  const { reconnect } = useChatRealtimeConnection();
  const session = useChatRealtimeRoom(roomId);
  const {
    close: closeMembershipDialog,
    isOpen: isMembershipDialogOpen,
    open: openMembershipDialog,
    triggerRef: membershipDialogTriggerRef,
  } = useChatRoomMembershipDialog(roomId);
  const {
    close: closeMessageSearchDialogOverlay,
    isOpen: isMessageSearchDialogOpen,
    open: openMessageSearchDialog,
    triggerRef: messageSearchDialogTriggerRef,
  } = useChatRoomMessageSearchDialog(roomId);
  const messageSearch = useRoomMessageSearch(roomId, {
    enabled: session.isActive && isMessageSearchDialogOpen,
    generation: session.generation,
  });
  const messageContext = useRoomMessageContext(roomId, {
    enabled: session.isActive && isMessageSearchDialogOpen,
    generation: session.generation,
    searchSessionGeneration: messageSearch.sessionGeneration,
  });
  const clearMessageSearch = messageSearch.clearSearch;
  const closeMessageContext = messageContext.closeContext;
  const closeMessageSearchDialog = useCallback(() => {
    closeMessageContext();
    clearMessageSearch();
    closeMessageSearchDialogOverlay();
  }, [clearMessageSearch, closeMessageContext, closeMessageSearchDialogOverlay]);
  const messageMutations = useChatMessageMutations({
    enabled: session.isActive,
    generation: session.generation,
    roomId,
  });
  const roomQuery = useRoomDetailsQuery(roomId);
  const {
    fetchNextPage: fetchNextParticipantProfilesPage,
    hasNextPage: hasNextParticipantProfilesPage,
    isFetchNextPageError: isParticipantProfilesNextPageError,
    isFetchingNextPage: isFetchingNextParticipantProfilesPage,
    memberships: participantProfiles,
  } = useRoomMembershipsQuery(roomId, {
    enabled: session.isActive,
    limit: ROOM_PARTICIPANT_PROFILE_PAGE_LIMIT,
    status: "ACTIVE",
  });
  useEffect(() => {
    if (
      !session.isActive ||
      !hasNextParticipantProfilesPage ||
      isFetchingNextParticipantProfilesPage ||
      isParticipantProfilesNextPageError
    ) {
      return;
    }

    void fetchNextParticipantProfilesPage();
  }, [
    fetchNextParticipantProfilesPage,
    hasNextParticipantProfilesPage,
    isFetchingNextParticipantProfilesPage,
    isParticipantProfilesNextPageError,
    session.isActive,
  ]);
  const receiptMembershipMismatchRef = useRef<string | null>(null);
  const messageHistory = useRoomMessageHistoryQuery(roomId, {
    enabled: session.isActive,
    limit: DEFAULT_MESSAGE_HISTORY_LIMIT,
  });
  const receiptStateQuery = useRoomReadReceiptStateQuery(roomId, {
    enabled: session.isActive,
    generation: session.generation,
  });
  const coordinatorEnabled =
    session.messageVisibleAfterSequence !== null &&
    session.watermarkSequence !== null &&
    isChatRoomSnapshotReadyForRealtimeMerge({
      hasMessageHistory: messageHistory.data !== undefined,
      isMessageHistoryRefetching: messageHistory.isRefetching,
      isRoomActive: session.isActive,
      messageHistoryStatus: messageHistory.status,
    });
  const realtimeQuery = useChatRealtimeQueryCoordinator({
    enabled: coordinatorEnabled,
    roomId,
    generation: session.generation,
    limit: DEFAULT_MESSAGE_HISTORY_LIMIT,
    messageVisibleAfterSequence: session.messageVisibleAfterSequence ?? 0,
    watermarkSequence: session.watermarkSequence ?? 0,
  });
  const realtimeReady =
    coordinatorEnabled && realtimeQuery.isSynchronized && realtimeQuery.error === null;
  const sessionView = getChatRoomSessionView(session, roomId, realtimeReady);
  const room = roomQuery.data;
  const latestConfirmedSequence = messageHistory.messages.at(-1)?.roomSequence ?? null;
  const fetchNextMessageHistoryPage = messageHistory.fetchNextPage;
  const entryHistory = useMemo(
    () => ({
      hasOlderMessages: messageHistory.hasNextPage,
      messages: messageHistory.messages,
    }),
    [messageHistory.hasNextPage, messageHistory.messages],
  );
  const loadOlderEntryHistory = useCallback(async () => {
    const result = await fetchNextMessageHistoryPage();

    if (result.isError) {
      throw result.error;
    }

    return {
      hasOlderMessages: result.hasNextPage,
      messages: flattenRoomMessageHistoryPages(roomId, result.data?.pages),
    };
  }, [fetchNextMessageHistoryPage, roomId]);
  const entryNavigation = useChatRoomEntryNavigation({
    enabled: session.isActive,
    generation: session.generation,
    history: entryHistory,
    historyReady: messageHistory.status === "success",
    latestConfirmedSequence,
    loadOlder: loadOlderEntryHistory,
    receiptState: receiptStateQuery.data,
    receiptStateReady:
      receiptStateQuery.status === "success" && realtimeQuery.readReceiptStatus === "ready",
    receiptStateUnavailable:
      receiptStateQuery.status === "error" ||
      realtimeQuery.readReceiptStatus === "error" ||
      realtimeQuery.readReceiptStatus === "terminal",
    roomId,
    selfMembershipId: room?.myMembership?.membershipId ?? null,
  });
  const entryNavigationNotice = createChatRoomEntryNavigationNotice(entryNavigation);
  const participantDisplayNames = useMemo(
    () => createRoomParticipantDisplayNames(participantProfiles),
    [participantProfiles],
  );
  const readReceiptPresentation = useMemo(
    () =>
      createChatMessageReadReceiptPresentation({
        messages: messageHistory.messages,
        receiptState: receiptStateQuery.data,
        receiptSyncStatus: realtimeQuery.readReceiptStatus,
        selfMembershipId: room?.myMembership?.membershipId ?? null,
      }),
    [
      messageHistory.messages,
      realtimeQuery.readReceiptStatus,
      receiptStateQuery.data,
      room?.myMembership?.membershipId,
    ],
  );
  const receiptMembershipMismatchKey =
    readReceiptPresentation.membershipMismatch && room?.myMembership && receiptStateQuery.data
      ? `${session.generation}:${room.myMembership.membershipId}:${receiptStateQuery.data.selfMembershipId}`
      : null;
  const timeline = useMemo(
    () => createChatMessageTimeline(messageHistory.messages, outgoingMessages),
    [messageHistory.messages, outgoingMessages],
  );
  const timelineRows = useMemo(
    () =>
      createChatMessageTimelineRows(timeline, {
        readBoundaryAfterSequence: entryNavigation.readBoundaryAfterSequence,
      }),
    [entryNavigation.readBoundaryAfterSequence, timeline],
  );
  const viewportItems = useMemo(
    () =>
      createChatMessageViewportItemViewModels(
        timelineRows,
        room?.myMembership?.membershipId ?? null,
        messageMutations.states,
        readReceiptPresentation.summaries,
        participantDisplayNames,
      ),
    [
      messageMutations.states,
      participantDisplayNames,
      readReceiptPresentation.summaries,
      room?.myMembership?.membershipId,
      timelineRows,
    ],
  );
  const messageItems = useMemo(
    () => viewportItems.flatMap((item) => (item.kind === "message" ? [item.item] : [])),
    [viewportItems],
  );
  const viewportKey = `${roomId}:${session.generation}`;
  const messageActions = useChatMessageActionsBottomSheet({
    items: messageItems,
    onDeleteMessage: messageMutations.deleteMessage,
    onEditMessage: messageMutations.editMessage,
    viewportKey,
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
  const readStateEnabled = realtimeReady && session.isActive && entryNavigation.canReportReadState;
  const readStateMembership = room?.myMembership ?? null;
  const readStateMembershipLifecycle = useMemo(
    () =>
      getChatRoomReadStateMembershipLifecycle({
        enabled: readStateEnabled,
        membership: readStateMembership,
        messageVisibleAfterSequence: session.messageVisibleAfterSequence,
      }),
    [readStateEnabled, readStateMembership, session.messageVisibleAfterSequence],
  );
  const readStateTerminalReason: ChatRoomReadStateCancellationReason | null =
    session.connectionError?.code === "ROOM_ACCESS_REVOKED"
      ? "ACCESS_REVOKED"
      : session.connectionError?.code === "ROOM_CLOSED" ||
          session.error?.code === "ROOM_CLOSED" ||
          room?.status === "CLOSED" ||
          room?.participationStatus === "ROOM_CLOSED"
        ? "ROOM_CLOSED"
        : room?.participationStatus === "LEFT" ||
            room?.participationStatus === "BANNED" ||
            room?.participationStatus === "NOT_JOINED"
          ? room.participationStatus
          : null;
  const updateReadThroughSequence = useChatRoomReadState(roomId, {
    activeGeneration: readStateEnabled ? session.generation : null,
    membershipLifecycle: readStateMembershipLifecycle,
    terminalReason: readStateTerminalReason,
  });

  useEffect(() => {
    outbox.acknowledgeConfirmed(
      roomId,
      new Set(messageHistory.messages.map((message) => message.clientMessageId)),
    );
  }, [messageHistory.messages, outbox, roomId]);

  useEffect(() => {
    if (receiptMembershipMismatchKey === null) {
      receiptMembershipMismatchRef.current = null;
      return;
    }

    if (receiptMembershipMismatchRef.current === receiptMembershipMismatchKey) {
      return;
    }

    receiptMembershipMismatchRef.current = receiptMembershipMismatchKey;
    void roomQuery.refetch();
    void receiptStateQuery.refetch();
  }, [receiptMembershipMismatchKey, receiptStateQuery, roomQuery]);

  useEffect(() => {
    if (isMessageSearchDialogOpen && !session.isActive) {
      closeMessageSearchDialog();
    }
  }, [closeMessageSearchDialog, isMessageSearchDialogOpen, session.isActive]);

  return (
    <ChatRoomView
      header={header}
      headerAction={
        room ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ChatRoomMessageSearchDialogTrigger
              disabled={!session.isActive}
              isOpen={isMessageSearchDialogOpen}
              onOpen={openMessageSearchDialog}
              ref={messageSearchDialogTriggerRef}
            />
            <ChatRoomMembershipDialogTrigger
              isOpen={isMembershipDialogOpen}
              onOpen={openMembershipDialog}
              ref={membershipDialogTriggerRef}
            />
          </div>
        ) : null
      }
      messageHistory={{
        canLoadOlder: messageHistory.hasNextPage,
        entryNavigation: entryNavigationNotice,
        feedback,
        initialScrollTarget: entryNavigation.initialScrollTarget,
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
        onReadThroughSequence: updateReadThroughSequence,
        onRetry: () => void messageHistory.refetch(),
        readStateEnabled,
        roomLabel: `${roomId} 메시지`,
        viewportKey,
      }}
      overlay={
        isMessageSearchDialogOpen && room ? (
          <ChatRoomMessageSearchDialog
            context={messageContext}
            controller={messageSearch}
            onClose={closeMessageSearchDialog}
            participantDisplayNames={participantDisplayNames}
          />
        ) : isMembershipDialogOpen && room ? (
          <ChatRoomMembershipDialog onClose={closeMembershipDialog} room={room} roomId={roomId} />
        ) : messageActions.sheet ? (
          <ChatMessageActionsBottomSheet sheet={messageActions.sheet} />
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
      sessionIndicator={<ChatRoomSessionIndicator view={sessionView} />}
      sessionNotice={
        <ChatRoomSessionNotice
          onReactivate={session.reactivate}
          onReconnect={reconnect}
          view={sessionView}
        />
      }
      sessionControls={<ChatRoomSessionControls roomId={roomId} view={sessionView} />}
      syncStatus={
        <ChatRealtimeSyncStatus
          error={realtimeQuery.error}
          onRetry={realtimeQuery.retry}
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
