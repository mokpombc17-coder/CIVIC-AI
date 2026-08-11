"use client";

import { useCallback, useRef, useState } from "react";

export function useChatRoomMessageSearchDialog(roomId: string) {
  const [openRoomId, setOpenRoomId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isOpen = openRoomId === roomId;

  const open = useCallback(() => {
    setOpenRoomId(roomId);
  }, [roomId]);

  const close = useCallback(() => {
    setOpenRoomId(null);
    const trigger = triggerRef.current;

    requestAnimationFrame(() => {
      if (trigger?.isConnected) {
        trigger.focus();
      }
    });
  }, []);

  return {
    close,
    isOpen,
    open,
    triggerRef,
  };
}
