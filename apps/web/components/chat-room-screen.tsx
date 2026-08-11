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
import { ChatRoomView } from "@/components/chat-room-view";
import { ChatRealtimeSyncStatus } from "@/components/chat-realtime-sync-status";
import { useChatRoomContentExperience } from "@/components/use-chat-room-content-experience";
import { useChatRoomMembershipDialog } from "@/components/use-chat-room-membership-dialog";
import { useChatRoomMessageSearchExperience } from "@/components/use-chat-room-message-search-experience";
import { useChatRoomRealtimeExperience } from "@/components/use-chat-room-realtime-experience";

export function ChatRoomScreen({ roomId }: { roomId: string }) {
  const realtime = useChatRoomRealtimeExperience(roomId);
  const { coordinator, coordinatorEnabled, session } = realtime;
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
  const content = useChatRoomContentExperience(roomId, realtime);
  const overlayKind = resolveChatRoomScreenOverlayKind({
    hasMessageActions: content.messageActions.sheet !== null,
    isMembershipDialogOpen,
    isMessageSearchDialogOpen: messageSearchExperience.isOpen,
    roomAvailable: content.room !== undefined,
  });

  return (
    <ChatRoomView
      header={content.header}
      headerAction={
        <ChatRoomScreenHeaderActions
          isMembershipDialogOpen={isMembershipDialogOpen}
          isMessageSearchDialogOpen={messageSearchExperience.isOpen}
          membershipDialogTriggerRef={membershipDialogTriggerRef}
          messageSearchDialogTriggerRef={messageSearchExperience.triggerRef}
          onOpenMembershipDialog={openMembershipDialog}
          onOpenMessageSearchDialog={messageSearchExperience.open}
          roomAvailable={content.room !== undefined}
          searchDisabled={!session.isActive}
        />
      }
      messageHistory={content.messageHistory}
      overlay={
        overlayKind ? (
          <ChatRoomScreenOverlay
            kind={overlayKind}
            membershipDialog={{
              isOpen: isMembershipDialogOpen,
              onClose: closeMembershipDialog,
            }}
            messageActionsSheet={content.messageActions.sheet}
            messageSearchDialog={{
              context: messageSearchExperience.context,
              controller: messageSearchExperience.controller,
              isOpen: messageSearchExperience.isOpen,
              onClose: messageSearchExperience.close,
            }}
            participantDisplayNames={content.participantDisplayNames}
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
