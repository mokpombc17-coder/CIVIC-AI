"use client";

import type { RefObject } from "react";
import { ChatMessageActionsBottomSheet } from "@/components/chat-message-actions-bottom-sheet";
import {
  ChatRoomMembershipDialog,
  ChatRoomMembershipDialogTrigger,
} from "@/components/chat-room-membership-dialog";
import {
  ChatRoomMessageSearchDialog,
  ChatRoomMessageSearchDialogTrigger,
  type ChatRoomMessageContextDialogController,
  type ChatRoomMessageSearchDialogController,
} from "@/components/chat-room-message-search-dialog";
import type { ChatMessageActionsBottomSheetViewModel } from "@/components/use-chat-message-actions-bottom-sheet";
import type { RoomDetails } from "@/lib/chat/chat-room-contracts";

type ChatRoomScreenOverlayControl = Readonly<{
  isOpen: boolean;
  onClose: () => void;
}>;

export function ChatRoomScreenHeaderActions({
  isMembershipDialogOpen,
  isMessageSearchDialogOpen,
  membershipDialogTriggerRef,
  messageSearchDialogTriggerRef,
  onOpenMembershipDialog,
  onOpenMessageSearchDialog,
  roomAvailable,
  searchDisabled,
}: Readonly<{
  isMembershipDialogOpen: boolean;
  isMessageSearchDialogOpen: boolean;
  membershipDialogTriggerRef: RefObject<HTMLButtonElement | null>;
  messageSearchDialogTriggerRef: RefObject<HTMLButtonElement | null>;
  onOpenMembershipDialog: () => void;
  onOpenMessageSearchDialog: () => void;
  roomAvailable: boolean;
  searchDisabled: boolean;
}>) {
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

export type ChatRoomScreenOverlayKind = "message-search" | "membership" | "message-actions";

export function resolveChatRoomScreenOverlayKind({
  hasMessageActions,
  isMembershipDialogOpen,
  isMessageSearchDialogOpen,
  roomAvailable,
}: Readonly<{
  hasMessageActions: boolean;
  isMembershipDialogOpen: boolean;
  isMessageSearchDialogOpen: boolean;
  roomAvailable: boolean;
}>): ChatRoomScreenOverlayKind | null {
  if (roomAvailable && isMessageSearchDialogOpen) {
    return "message-search";
  }

  if (roomAvailable && isMembershipDialogOpen) {
    return "membership";
  }

  return hasMessageActions ? "message-actions" : null;
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
  membershipDialog: ChatRoomScreenOverlayControl;
  messageActionsSheet: ChatMessageActionsBottomSheetViewModel | null;
  messageSearchDialog: ChatRoomScreenOverlayControl &
    Readonly<{
      context: ChatRoomMessageContextDialogController;
      controller: ChatRoomMessageSearchDialogController;
    }>;
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
