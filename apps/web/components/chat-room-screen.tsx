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

export function ChatRoomScreen({ roomId }: { roomId: string }) {
  const realtime = useChatRoomRealtimeExperience(roomId);
  const { coordinator, coordinatorEnabled, session } = realtime;
  const content = useChatRoomContentExperience(roomId, realtime);
  const overlays = useChatRoomOverlayExperience(roomId, {
    generation: session.generation,
    hasMessageActions: content.messageActions.sheet !== null,
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
          <ChatRoomScreenMessageSearchPanel
            messageSearchPanel={overlays.messageSearchPanel}
            participantDisplayNames={content.participantDisplayNames}
          />
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
