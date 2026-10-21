"use client";

import { useEffect, useState } from "react";
import {
  ChatRoomScreenHeaderActions,
  ChatRoomScreenMessageSearchPanel,
  ChatRoomScreenOverlay,
} from "@/components/chat/chat-room-screen-overlays";
import { ChatRoomSessionControls } from "@/components/chat/chat-room-session-controls";
import {
  ChatRoomSessionIndicator,
  ChatRoomSessionNotice,
} from "@/components/chat/chat-room-session-status";
import { shouldHoldChatRoomInitialEntry } from "@/components/chat/chat-room-initial-entry";
import { ChatRoomView } from "@/components/chat/chat-room-view";
import { ChatRealtimeSyncStatus } from "@/components/chat/chat-realtime-sync-status";
import { useChatOutgoingMessages } from "@/components/chat/chat-realtime-provider";
import { useFeatureFailureAnalytics } from "@/components/use-feature-failure-analytics";
import { useChatRoomContentExperience } from "@/components/chat/use-chat-room-content-experience";
import { useChatRoomOverlayExperience } from "@/components/chat/use-chat-room-overlay-experience";
import { useChatRoomRealtimeExperience } from "@/components/chat/use-chat-room-realtime-experience";
import { useRoomMessageNavigation } from "@/components/chat/use-room-message-context";
import { getFeatureFailureDetails } from "@/lib/analytics/feature-failure-analytics";
import { useRoomDetailsQuery } from "@/lib/chat/chat-room-queries";

export function ChatRoomScreen({ roomId }: { roomId: string }) {
  const [positionedViewportKey, setPositionedViewportKey] = useState<string | null>(null);
  const failureAnalytics = useFeatureFailureAnalytics("chat", `room:${roomId}`);
  const roomQuery = useRoomDetailsQuery(roomId);
  const realtime = useChatRoomRealtimeExperience(roomId, {
    roomStatus: roomQuery.data?.status,
  });
  const { coordinator, coordinatorEnabled, session } = realtime;
  const messageNavigation = useRoomMessageNavigation(roomId, {
    enabled: session.isActive,
    generation: session.generation,
    liveMessages: realtime.messageHistory.messages,
  });
  const content = useChatRoomContentExperience(roomId, roomQuery, realtime, messageNavigation);
  const viewportKey = content.messageHistory.viewportKey;
  const initialEntryPending = useChatRoomInitialEntryPending(
    roomId,
    shouldHoldChatRoomInitialEntry({
      hasRoomError: content.roomError !== null,
      sessionKind: realtime.sessionView.kind,
      viewportPositioned: positionedViewportKey === viewportKey,
    }),
  );
  const overlays = useChatRoomOverlayExperience(roomId, {
    generation: session.generation,
    hasMessageActions: content.messageActions.sheet !== null,
    onNavigateToMessage: messageNavigation.navigateToMessage,
    roomActive: session.isActive,
    roomAvailable: content.room !== undefined,
  });
  const outgoingMessages = useChatOutgoingMessages(roomId);
  const messageHistoryErrorVisible = content.messageHistory.feedback?.kind === "error";
  const expectedConnectionTransition =
    session.connectionError?.code === "AUTHENTICATION_REQUIRED" ||
    session.connectionError?.code === "CONNECTION_REPLACED" ||
    session.connectionError?.code === "ROOM_ACCESS_REVOKED" ||
    session.connectionError?.code === "ROOM_CLOSED";
  const realtimeFailure =
    (!expectedConnectionTransition &&
      (session.connectionStatus === "error" ||
        (session.connectionStatus === "disconnected" && session.connectionError !== null))) ||
    (session.status === "error" &&
      session.error?.code !== "INVALID_ROOM_ID" &&
      session.error?.code !== "ROOM_CLOSED");

  useEffect(() => {
    if (roomQuery.isError) {
      failureAnalytics.trackFailure({
        ...getFeatureFailureDetails(roomQuery.error, "api", "chat_room_load_failed"),
        incidentKey: "room-load",
        operation: "screen_load",
        retryCount: Math.max(0, roomQuery.failureCount - 1),
        surface: "room",
      });
      return;
    }
    if (roomQuery.isSuccess) failureAnalytics.trackRecovered("room-load");
  }, [
    failureAnalytics,
    roomQuery.error,
    roomQuery.failureCount,
    roomQuery.isError,
    roomQuery.isSuccess,
  ]);

  useEffect(() => {
    if (
      messageHistoryErrorVisible &&
      realtime.messageHistory.isError &&
      !realtime.messageHistory.isFetchNextPageError
    ) {
      failureAnalytics.trackFailure({
        ...getFeatureFailureDetails(
          realtime.messageHistory.error,
          "api",
          "chat_message_history_load_failed",
        ),
        incidentKey: "message-history-load",
        operation: "screen_load",
        surface: "room_history",
      });
      return;
    }
    if (realtime.messageHistory.status === "success") {
      failureAnalytics.trackRecovered("message-history-load");
    }
  }, [
    failureAnalytics,
    messageHistoryErrorVisible,
    realtime.messageHistory.error,
    realtime.messageHistory.isError,
    realtime.messageHistory.isFetchNextPageError,
    realtime.messageHistory.status,
  ]);

  useEffect(() => {
    if (realtimeFailure) {
      const error = session.connectionError ?? session.error;
      failureAnalytics.trackFailure({
        ...getFeatureFailureDetails(
          error,
          session.connectionError?.source === "worker" ? "client" : "websocket",
          "realtime_connect_failed",
        ),
        incidentKey: "realtime-connect",
        operation: "realtime_connect",
        surface: "room",
      });
      return;
    }
    if (realtime.sessionView.kind === "active") {
      failureAnalytics.trackRecovered("realtime-connect");
    }
  }, [
    failureAnalytics,
    realtime.sessionView.kind,
    realtimeFailure,
    session.connectionError,
    session.error,
  ]);

  useEffect(() => {
    for (const message of outgoingMessages) {
      const incidentKey = `message-send:${message.clientMessageId}`;
      if (message.status === "failed") {
        failureAnalytics.trackFailure({
          errorCode: "message_send_failed",
          errorSource: "websocket",
          incidentKey,
          operation: "message_send",
          retryCount: Math.max(0, message.attempt - 1),
          retryable: true,
          surface: "room",
        });
      } else if (message.status === "accepted") {
        failureAnalytics.trackRecovered(incidentKey);
      }
    }
  }, [failureAnalytics, outgoingMessages]);

  const roomError = content.roomError
    ? {
        ...content.roomError,
        onRetry: () => {
          failureAnalytics.trackRecoveryAttempt("room-load", "user_retry");
          content.roomError?.onRetry();
        },
      }
    : null;
  const messageHistory = {
    ...content.messageHistory,
    onRetry: () => {
      failureAnalytics.trackRecoveryAttempt("message-history-load", "user_retry");
      content.messageHistory.onRetry();
    },
  };

  return (
    <ChatRoomView
      header={
        initialEntryPending
          ? {
              ...content.header,
              title: "토론방",
            }
          : content.header
      }
      headerAction={<ChatRoomScreenHeaderActions {...overlays.headerActions} />}
      initializing={initialEntryPending}
      messageHistory={messageHistory}
      onInitialViewportPositioned={setPositionedViewportKey}
      messageSearchPanel={
        overlays.messageSearchPanel.visible ? (
          <ChatRoomScreenMessageSearchPanel messageSearchPanel={overlays.messageSearchPanel} />
        ) : null
      }
      overlay={
        overlays.kind ? (
          <ChatRoomScreenOverlay
            kind={overlays.kind}
            membershipDialog={overlays.membershipDialog}
            messageActionsSheet={content.messageActions.sheet}
            room={content.room}
            roomId={roomId}
          />
        ) : null
      }
      roomError={roomError}
      sessionIndicator={<ChatRoomSessionIndicator view={realtime.sessionView} />}
      sessionNotice={
        <ChatRoomSessionNotice
          onReactivate={() => {
            failureAnalytics.trackRecoveryAttempt("realtime-connect", "user_retry");
            session.reactivate();
          }}
          onReconnect={() => {
            failureAnalytics.trackRecoveryAttempt("realtime-connect", "user_retry");
            realtime.reconnect();
          }}
          onReload={() => {
            failureAnalytics.trackRecoveryAttempt("realtime-connect", "user_retry");
            window.location.reload();
          }}
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

function useChatRoomInitialEntryPending(roomId: string, pending: boolean): boolean {
  const [completedRoomId, setCompletedRoomId] = useState<string | null>(null);

  useEffect(() => {
    if (pending || completedRoomId === roomId) {
      return;
    }

    const timeout = window.setTimeout(() => setCompletedRoomId(roomId), 0);

    return () => window.clearTimeout(timeout);
  }, [completedRoomId, pending, roomId]);

  return pending && completedRoomId !== roomId;
}
