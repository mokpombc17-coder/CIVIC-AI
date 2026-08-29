"use client";

import { ChatMessageActionsBottomSheet } from "@/components/chat-message-actions-bottom-sheet";
import {
  ChatRoomMembershipDialog,
  ChatRoomMembershipDialogTrigger,
} from "@/components/chat-room-membership-dialog";
import {
  ChatRoomMessageSearchPanel,
  ChatRoomMessageSearchPanelTrigger,
} from "@/components/chat-room-message-search-dialog";
import type { ChatRoomScreenOverlayKind } from "@/components/chat-room-screen-overlay-model";
import type { ChatMessageActionsBottomSheetViewModel } from "@/components/use-chat-message-actions-bottom-sheet";
import type { ChatRoomOverlayExperience } from "@/components/use-chat-room-overlay-experience";
import type { RoomDetails } from "@/lib/chat/chat-room-contracts";

type ChatRoomScreenHeaderActionsViewModel = ChatRoomOverlayExperience["headerActions"];

export function ChatRoomScreenHeaderActions({
  isMembershipDialogOpen,
  isMessageSearchPanelOpen,
  membershipDialogTriggerRef,
  messageSearchPanelTriggerRef,
  onOpenMembershipDialog,
  onOpenMessageSearchPanel,
  roomAvailable,
  searchDisabled,
}: ChatRoomScreenHeaderActionsViewModel) {
  if (!roomAvailable) {
    return null;
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <ChatRoomMessageSearchPanelTrigger
        disabled={searchDisabled}
        isOpen={isMessageSearchPanelOpen}
        onOpen={onOpenMessageSearchPanel}
        ref={messageSearchPanelTriggerRef}
      />
      <ChatRoomMembershipDialogTrigger
        isOpen={isMembershipDialogOpen}
        onOpen={onOpenMembershipDialog}
        ref={membershipDialogTriggerRef}
      />
    </div>
  );
}

export function ChatRoomScreenMessageSearchPanel({
  messageSearchPanel,
}: Readonly<{
  messageSearchPanel: ChatRoomOverlayExperience["messageSearchPanel"];
}>) {
  return (
    <ChatRoomMessageSearchPanel
      controller={messageSearchPanel.controller}
      navigation={messageSearchPanel.navigation}
      onClose={messageSearchPanel.onClose}
    />
  );
}

export function ChatRoomScreenOverlay({
  kind,
  membershipDialog,
  messageActionsSheet,
  room,
  roomId,
}: Readonly<{
  kind: ChatRoomScreenOverlayKind;
  membershipDialog: ChatRoomOverlayExperience["membershipDialog"];
  messageActionsSheet: ChatMessageActionsBottomSheetViewModel | null;
  room: RoomDetails | undefined;
  roomId: string;
}>) {
  switch (kind) {
    case "membership":
      if (!room) {
        return null;
      }

      return (
        <ChatRoomMembershipDialog onClose={membershipDialog.onClose} room={room} roomId={roomId} />
      );
    case "message-actions":
      return messageActionsSheet ? (
        <ChatMessageActionsBottomSheet sheet={messageActionsSheet} />
      ) : null;
  }
}
