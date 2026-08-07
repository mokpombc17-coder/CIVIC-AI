"use client";

import { useCallback, useEffect } from "react";
import { useChatRoomReadStateCoordinator } from "@/components/chat-room-read-state-provider";
import type { ChatRoomReadStateCancellationReason } from "@/lib/chat/chat-room-read-state-coordinator";
import { applyChatRoomReadStateRoomLifecycle } from "@/lib/chat/chat-room-read-state-room-lifecycle";

type UseChatRoomReadStateOptions = Readonly<{
  activeGeneration: number | null;
  terminalReason: ChatRoomReadStateCancellationReason | null;
}>;

export function useChatRoomReadState(
  roomId: string,
  { activeGeneration, terminalReason }: UseChatRoomReadStateOptions,
): (throughSequence: number) => void {
  const coordinator = useChatRoomReadStateCoordinator();

  useEffect(() => {
    applyChatRoomReadStateRoomLifecycle({
      coordinator,
      isSynchronizationReady: activeGeneration !== null,
      roomId,
      terminalReason,
    });
  }, [activeGeneration, coordinator, roomId, terminalReason]);

  return useCallback(
    (throughSequence: number) => {
      coordinator.schedule(roomId, throughSequence);
    },
    [coordinator, roomId],
  );
}
