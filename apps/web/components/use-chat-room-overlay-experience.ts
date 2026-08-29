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
  onNavigateToMessage: (messageId: string) => void;
  roomActive: boolean;
  roomAvailable: boolean;
}>;

type ChatRoomOverlayExperienceState = Readonly<{
  kind: ChatRoomScreenOverlayKind | null;
  roomAvailable: boolean;
  searchDisabled: boolean;
  searchPanelVisible: boolean;
}>;

export function useChatRoomOverlayExperience(
  roomId: string,
  {
    generation,
    hasMessageActions,
    onNavigateToMessage,
    roomActive,
    roomAvailable,
  }: ChatRoomOverlayExperienceOptions,
) {
  const membershipDialog = useChatRoomMembershipDialog(roomId);
  const messageSearchPanel = useChatRoomMessageSearchExperience(roomId, {
    generation,
    onNavigateToMessage,
    roomActive,
  });
  const state = createChatRoomOverlayExperienceState({
    hasMessageActions,
    isMembershipDialogOpen: membershipDialog.isOpen,
    isMessageSearchPanelOpen: messageSearchPanel.isOpen,
    roomActive,
    roomAvailable,
  });

  return {
    headerActions: {
      isMembershipDialogOpen: membershipDialog.isOpen,
      isMessageSearchPanelOpen: messageSearchPanel.isOpen,
      membershipDialogTriggerRef: membershipDialog.triggerRef,
      messageSearchPanelTriggerRef: messageSearchPanel.triggerRef,
      onOpenMembershipDialog: membershipDialog.open,
      onOpenMessageSearchPanel: messageSearchPanel.open,
      roomAvailable: state.roomAvailable,
      searchDisabled: state.searchDisabled,
    },
    kind: state.kind,
    membershipDialog: {
      onClose: membershipDialog.close,
    },
    messageSearchPanel: {
      controller: messageSearchPanel.controller,
      onNavigateToMessage: messageSearchPanel.onNavigateToMessage,
      onClose: messageSearchPanel.close,
      visible: state.searchPanelVisible,
    },
  };
}

export type ChatRoomOverlayExperience = ReturnType<typeof useChatRoomOverlayExperience>;

export function createChatRoomOverlayExperienceState({
  hasMessageActions,
  isMembershipDialogOpen,
  isMessageSearchPanelOpen,
  roomActive,
  roomAvailable,
}: Readonly<{
  hasMessageActions: boolean;
  isMembershipDialogOpen: boolean;
  isMessageSearchPanelOpen: boolean;
  roomActive: boolean;
  roomAvailable: boolean;
}>): ChatRoomOverlayExperienceState {
  return {
    kind: resolveChatRoomScreenOverlayKind({
      hasMessageActions,
      isMembershipDialogOpen,
      roomAvailable,
    }),
    roomAvailable,
    searchDisabled: !roomActive,
    searchPanelVisible: roomAvailable && isMessageSearchPanelOpen,
  };
}
