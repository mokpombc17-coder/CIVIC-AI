"use client";

import { useCallback, useEffect } from "react";
import { useChatRoomMessageSearchDialog } from "@/components/use-chat-room-message-search-dialog";
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
  const dialog = useChatRoomMessageSearchDialog(roomId);
  const controller = useRoomMessageSearch(roomId, {
    enabled: roomActive && dialog.isOpen,
    generation,
  });
  const context = useRoomMessageContext(roomId, {
    enabled: roomActive && dialog.isOpen,
    generation,
    searchSessionGeneration: controller.sessionGeneration,
  });
  const { clearSearch } = controller;
  const { closeContext } = context;
  const { close: closeDialog } = dialog;
  const close = useCallback(() => {
    closeChatRoomMessageSearchExperience({
      clearSearch,
      closeContext,
      closeDialog,
    });
  }, [clearSearch, closeContext, closeDialog]);

  useEffect(() => {
    if (shouldCloseChatRoomMessageSearchExperience(dialog.isOpen, roomActive)) {
      close();
    }
  }, [close, dialog.isOpen, roomActive]);

  return {
    close,
    context,
    controller,
    isOpen: dialog.isOpen,
    open: dialog.open,
    triggerRef: dialog.triggerRef,
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
