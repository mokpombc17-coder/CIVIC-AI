"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useChatRoomReadStateCoordinator } from "@/components/chat-room-read-state-provider";
import type {
  ChatRoomReadStateCancellationReason,
  ChatRoomReadStateMembershipLifecycle,
} from "@/lib/chat/chat-room-read-state-coordinator";
import { applyChatRoomReadStateRoomLifecycle } from "@/lib/chat/chat-room-read-state-room-lifecycle";

type UseChatRoomReadStateOptions = Readonly<{
  activeGeneration: number | null;
  membershipLifecycle: ChatRoomReadStateMembershipLifecycle | null;
  terminalReason: ChatRoomReadStateCancellationReason | null;
}>;

export function useChatRoomReadState(
  roomId: string,
  {
    activeGeneration,
    membershipLifecycle: membershipLifecycleInput,
    terminalReason,
  }: UseChatRoomReadStateOptions,
): (throughSequence: number) => void {
  const coordinator = useChatRoomReadStateCoordinator();
  const membershipId = membershipLifecycleInput?.membershipId ?? null;
  const membershipVersion = membershipLifecycleInput?.membershipVersion ?? null;
  const messageVisibleAfterSequence = membershipLifecycleInput?.messageVisibleAfterSequence ?? null;
  const membershipLifecycle = useMemo<ChatRoomReadStateMembershipLifecycle | null>(
    () =>
      membershipId === null || membershipVersion === null || messageVisibleAfterSequence === null
        ? null
        : Object.freeze({ membershipId, membershipVersion, messageVisibleAfterSequence }),
    [membershipId, membershipVersion, messageVisibleAfterSequence],
  );

  useEffect(() => {
    if (membershipLifecycle !== null) {
      coordinator.synchronizeRoomMembershipLifecycle(roomId, membershipLifecycle);
    }

    applyChatRoomReadStateRoomLifecycle({
      coordinator,
      isSynchronizationReady: activeGeneration !== null && membershipLifecycle !== null,
      roomId,
      terminalReason,
    });
  }, [activeGeneration, coordinator, membershipLifecycle, roomId, terminalReason]);

  return useCallback(
    (throughSequence: number) => {
      if (membershipLifecycle !== null) {
        coordinator.schedule(roomId, throughSequence, membershipLifecycle);
      }
    },
    [coordinator, membershipLifecycle, roomId],
  );
}
