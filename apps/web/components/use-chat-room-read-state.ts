"use client";

import { useCallback } from "react";
import { useChatRoomReadStateCoordinator } from "@/components/chat-room-read-state-provider";

export function useChatRoomReadState(roomId: string): (throughSequence: number) => void {
  const coordinator = useChatRoomReadStateCoordinator();

  return useCallback(
    (throughSequence: number) => {
      coordinator.schedule(roomId, throughSequence);
    },
    [coordinator, roomId],
  );
}
