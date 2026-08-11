"use client";

import {
  resolveChatRoomScreenOverlayKind,
  type ChatRoomScreenOverlayKind,
} from "@/components/chat-room-screen-overlay-model";
import { useChatRoomMembershipDialog } from "@/components/use-chat-room-membership-dialog";
import { useChatRoomMessageSearchExperience } from "@/components/use-chat-room-message-search-experience";

type ChatRoomOverlayExperienceOptions = Readonly<{
  generation: number;
  hasMessageActions: boolean;
  roomActive: boolean;
  roomAvailable: boolean;
}>;

type ChatRoomOverlayExperienceState = Readonly<{
  kind: ChatRoomScreenOverlayKind | null;
  roomAvailable: boolean;
  searchDisabled: boolean;
}>;

export function useChatRoomOverlayExperience(
  roomId: string,
  { generation, hasMessageActions, roomActive, roomAvailable }: ChatRoomOverlayExperienceOptions,
) {
  const membershipDialog = useChatRoomMembershipDialog(roomId);
  const messageSearchDialog = useChatRoomMessageSearchExperience(roomId, {
    generation,
    roomActive,
  });
  const state = createChatRoomOverlayExperienceState({
    hasMessageActions,
    isMembershipDialogOpen: membershipDialog.isOpen,
    isMessageSearchDialogOpen: messageSearchDialog.isOpen,
    roomActive,
    roomAvailable,
  });

  return {
    headerActions: {
      isMembershipDialogOpen: membershipDialog.isOpen,
      isMessageSearchDialogOpen: messageSearchDialog.isOpen,
      membershipDialogTriggerRef: membershipDialog.triggerRef,
      messageSearchDialogTriggerRef: messageSearchDialog.triggerRef,
      onOpenMembershipDialog: membershipDialog.open,
      onOpenMessageSearchDialog: messageSearchDialog.open,
      roomAvailable: state.roomAvailable,
      searchDisabled: state.searchDisabled,
    },
    kind: state.kind,
    membershipDialog: {
      onClose: membershipDialog.close,
    },
    messageSearchDialog: {
      context: messageSearchDialog.context,
      controller: messageSearchDialog.controller,
      onClose: messageSearchDialog.close,
    },
  };
}

export type ChatRoomOverlayExperience = ReturnType<typeof useChatRoomOverlayExperience>;

export function createChatRoomOverlayExperienceState({
  hasMessageActions,
  isMembershipDialogOpen,
  isMessageSearchDialogOpen,
  roomActive,
  roomAvailable,
}: Readonly<{
  hasMessageActions: boolean;
  isMembershipDialogOpen: boolean;
  isMessageSearchDialogOpen: boolean;
  roomActive: boolean;
  roomAvailable: boolean;
}>): ChatRoomOverlayExperienceState {
  return {
    kind: resolveChatRoomScreenOverlayKind({
      hasMessageActions,
      isMembershipDialogOpen,
      isMessageSearchDialogOpen,
      roomAvailable,
    }),
    roomAvailable,
    searchDisabled: !roomActive,
  };
}
