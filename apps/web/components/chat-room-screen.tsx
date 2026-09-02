"use client";

import {
  ChatRoomScreenHeaderActions,
  ChatRoomScreenMessageSearchPanel,
  ChatRoomScreenOverlay,
} from "@/components/chat-room-screen-overlays";
import { ChatRoomSessionControls } from "@/components/chat-room-session-controls";
import {
  ChatRoomSessionIndicator,
  ChatRoomSessionNotice,
} from "@/components/chat-room-session-status";
import { ChatRoomView } from "@/components/chat-room-view";
import { ChatRealtimeSyncStatus } from "@/components/chat-realtime-sync-status";
import { useChatRoomContentExperience } from "@/components/use-chat-room-content-experience";
import { useChatRoomOverlayExperience } from "@/components/use-chat-room-overlay-experience";
import { useChatRoomRealtimeExperience } from "@/components/use-chat-room-realtime-experience";
import { useRoomMessageNavigation } from "@/components/use-room-message-context";
import { useRoomDetailsQuery } from "@/lib/chat/chat-room-queries";

export function ChatRoomScreen({ roomId }: { roomId: string }) {
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
  const overlays = useChatRoomOverlayExperience(roomId, {
    generation: session.generation,
    hasMessageActions: content.messageActions.sheet !== null,
    onNavigateToMessage: messageNavigation.navigateToMessage,
    roomActive: session.isActive,
    roomAvailable: content.room !== undefined,
  });

  return (
    <ChatRoomView
      header={content.header}
      headerAction={<ChatRoomScreenHeaderActions {...overlays.headerActions} />}
      messageHistory={content.messageHistory}
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
      roomError={content.roomError}
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
