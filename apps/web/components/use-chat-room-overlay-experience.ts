"use client";

import {
  resolveChatRoomScreenOverlayKind,
  type ChatRoomScreenHeaderActionsViewModel,
  type ChatRoomScreenMessageSearchDialogControl,
  type ChatRoomScreenOverlayControl,
  type ChatRoomScreenOverlayKind,
} from "@/components/chat-room-screen-overlays";
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

export type ChatRoomOverlayExperience = Readonly<{
  headerActions: ChatRoomScreenHeaderActionsViewModel;
  kind: ChatRoomScreenOverlayKind | null;
  membershipDialog: ChatRoomScreenOverlayControl;
  messageSearchDialog: ChatRoomScreenMessageSearchDialogControl;
}>;

export function useChatRoomOverlayExperience(
  roomId: string,
  { generation, hasMessageActions, roomActive, roomAvailable }: ChatRoomOverlayExperienceOptions,
): ChatRoomOverlayExperience {
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
