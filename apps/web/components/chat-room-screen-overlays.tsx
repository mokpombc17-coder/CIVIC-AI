"use client";

import { ChatMessageActionsBottomSheet } from "@/components/chat-message-actions-bottom-sheet";
import {
  ChatRoomMembershipDialog,
  ChatRoomMembershipDialogTrigger,
} from "@/components/chat-room-membership-dialog";
import {
  ChatRoomMessageSearchDialog,
  ChatRoomMessageSearchDialogTrigger,
} from "@/components/chat-room-message-search-dialog";
import type { ChatRoomScreenOverlayKind } from "@/components/chat-room-screen-overlay-model";
import type { ChatMessageActionsBottomSheetViewModel } from "@/components/use-chat-message-actions-bottom-sheet";
import type { ChatRoomOverlayExperience } from "@/components/use-chat-room-overlay-experience";
import type { RoomDetails } from "@/lib/chat/chat-room-contracts";

type ChatRoomScreenHeaderActionsViewModel = ChatRoomOverlayExperience["headerActions"];

export function ChatRoomScreenHeaderActions({
  isMembershipDialogOpen,
  isMessageSearchDialogOpen,
  membershipDialogTriggerRef,
  messageSearchDialogTriggerRef,
  onOpenMembershipDialog,
  onOpenMessageSearchDialog,
  roomAvailable,
  searchDisabled,
}: ChatRoomScreenHeaderActionsViewModel) {
  if (!roomAvailable) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <ChatRoomMessageSearchDialogTrigger
        disabled={searchDisabled}
        isOpen={isMessageSearchDialogOpen}
        onOpen={onOpenMessageSearchDialog}
        ref={messageSearchDialogTriggerRef}
      />
      <ChatRoomMembershipDialogTrigger
        isOpen={isMembershipDialogOpen}
        onOpen={onOpenMembershipDialog}
        ref={membershipDialogTriggerRef}
      />
    </div>
  );
}

export function ChatRoomScreenOverlay({
  kind,
  membershipDialog,
  messageActionsSheet,
  messageSearchDialog,
  participantDisplayNames,
  room,
  roomId,
}: Readonly<{
  kind: ChatRoomScreenOverlayKind;
  membershipDialog: ChatRoomOverlayExperience["membershipDialog"];
  messageActionsSheet: ChatMessageActionsBottomSheetViewModel | null;
  messageSearchDialog: ChatRoomOverlayExperience["messageSearchDialog"];
  participantDisplayNames: ReadonlyMap<string, string>;
  room: RoomDetails | undefined;
  roomId: string;
}>) {
  switch (kind) {
    case "message-search":
      return (
        <ChatRoomMessageSearchDialog
          context={messageSearchDialog.context}
          controller={messageSearchDialog.controller}
          onClose={messageSearchDialog.onClose}
          participantDisplayNames={participantDisplayNames}
        />
      );
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
