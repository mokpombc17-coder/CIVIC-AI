"use client";

import { useCallback, useEffect } from "react";
import { useChatRoomMessageSearchPanel } from "@/components/use-chat-room-message-search-dialog";
import { useRoomMessageSearch } from "@/components/use-room-message-search";

type ChatRoomMessageSearchExperienceOptions = Readonly<{
  generation: number;
  onNavigateToMessage: (messageId: string) => void;
  roomActive: boolean;
}>;

type ChatRoomMessageSearchCloseActions = Readonly<{
  clearSearch: () => void;
  closeDialog: () => void;
}>;

type ChatRoomMessageSearchNavigationActions = Readonly<{
  closeSearch: () => void;
  messageId: string;
  onNavigateToMessage: (messageId: string) => void;
}>;

export function useChatRoomMessageSearchExperience(
  roomId: string,
  { generation, onNavigateToMessage, roomActive }: ChatRoomMessageSearchExperienceOptions,
) {
  const panel = useChatRoomMessageSearchPanel(roomId);
  const controller = useRoomMessageSearch(roomId, {
    enabled: roomActive && panel.isOpen,
    generation,
  });
  const { clearSearch } = controller;
  const { close: closeDialog } = panel;
  const close = useCallback(() => {
    closeChatRoomMessageSearchExperience({
      clearSearch,
      closeDialog,
    });
  }, [clearSearch, closeDialog]);
  const navigateToMessage = useCallback(
    (messageId: string) => {
      navigateFromChatRoomMessageSearch({
        closeSearch: close,
        messageId,
        onNavigateToMessage,
      });
    },
    [close, onNavigateToMessage],
  );

  useEffect(() => {
    if (shouldCloseChatRoomMessageSearchExperience(panel.isOpen, roomActive)) {
      close();
    }
  }, [close, panel.isOpen, roomActive]);

  return {
    close,
    controller,
    isOpen: panel.isOpen,
    open: panel.open,
    onNavigateToMessage: navigateToMessage,
    triggerRef: panel.triggerRef,
  };
}

export function navigateFromChatRoomMessageSearch({
  closeSearch,
  messageId,
  onNavigateToMessage,
}: ChatRoomMessageSearchNavigationActions): void {
  onNavigateToMessage(messageId);
  closeSearch();
}

export function closeChatRoomMessageSearchExperience({
  clearSearch,
  closeDialog,
}: ChatRoomMessageSearchCloseActions): void {
  clearSearch();
  closeDialog();
}

export function shouldCloseChatRoomMessageSearchExperience(
  isOpen: boolean,
  roomActive: boolean,
): boolean {
  return isOpen && !roomActive;
}
