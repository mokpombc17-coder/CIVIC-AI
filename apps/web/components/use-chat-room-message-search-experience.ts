"use client";

import { useCallback, useEffect } from "react";
import { useChatRoomMessageSearchPanel } from "@/components/use-chat-room-message-search-dialog";
import { useRoomMessageContext } from "@/components/use-room-message-context";
import { useRoomMessageSearch } from "@/components/use-room-message-search";

type ChatRoomMessageSearchExperienceOptions = Readonly<{
  generation: number;
  roomActive: boolean;
}>;

type ChatRoomMessageSearchCloseActions = Readonly<{
  clearSearch: () => void;
  closeContext: () => void;
  closeDialog: () => void;
}>;

export function useChatRoomMessageSearchExperience(
  roomId: string,
  { generation, roomActive }: ChatRoomMessageSearchExperienceOptions,
) {
  const panel = useChatRoomMessageSearchPanel(roomId);
  const controller = useRoomMessageSearch(roomId, {
    enabled: roomActive && panel.isOpen,
    generation,
  });
  const context = useRoomMessageContext(roomId, {
    enabled: roomActive && panel.isOpen,
    generation,
    searchSessionGeneration: controller.sessionGeneration,
  });
  const { clearSearch } = controller;
  const { closeContext } = context;
  const { close: closeDialog } = panel;
  const close = useCallback(() => {
    closeChatRoomMessageSearchExperience({
      clearSearch,
      closeContext,
      closeDialog,
    });
  }, [clearSearch, closeContext, closeDialog]);

  useEffect(() => {
    if (shouldCloseChatRoomMessageSearchExperience(panel.isOpen, roomActive)) {
      close();
    }
  }, [close, panel.isOpen, roomActive]);

  return {
    close,
    context,
    controller,
    isOpen: panel.isOpen,
    open: panel.open,
    triggerRef: panel.triggerRef,
  };
}

export function closeChatRoomMessageSearchExperience({
  clearSearch,
  closeContext,
  closeDialog,
}: ChatRoomMessageSearchCloseActions): void {
  closeContext();
  clearSearch();
  closeDialog();
}

export function shouldCloseChatRoomMessageSearchExperience(
  isOpen: boolean,
  roomActive: boolean,
): boolean {
  return isOpen && !roomActive;
}
