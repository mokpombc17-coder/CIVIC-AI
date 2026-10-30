"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useChatRoomReadStateCoordinator } from "@/components/chat/chat-room-read-state-provider";
import type {
  ChatRoomReadStateCancellationReason,
  ChatRoomReadStateMembershipLifecycle,
} from "@/lib/chat/chat-room-read-state-coordinator";
import { applyChatRoomReadStateRoomLifecycle } from "@/lib/chat/chat-room-read-state-room-lifecycle";

type UseChatRoomReadStateOptions = Readonly<{
  activeGeneration: number | null;
  membershipLifecycle: ChatRoomReadStateMembershipLifecycle | null;
  storedReadSequence: number | null;
  terminalReason: ChatRoomReadStateCancellationReason | null;
}>;

export function useChatRoomReadState(
  roomId: string,
  {
    activeGeneration,
    membershipLifecycle: membershipLifecycleInput,
    storedReadSequence,
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

  // Membership 동기화는 확정값을 볼 수 있는 첫 순번으로 초기화함
  // 서버 저장 순번은 그 뒤에 반영해야 초기화에 덮이지 않음
  useEffect(() => {
    if (membershipLifecycle !== null && storedReadSequence !== null) {
      coordinator.confirmStoredSequence(roomId, storedReadSequence);
    }
  }, [coordinator, membershipLifecycle, roomId, storedReadSequence]);

  return useCallback(
    (throughSequence: number) => {
      if (membershipLifecycle !== null) {
        coordinator.schedule(roomId, throughSequence, membershipLifecycle);
      }
    },
    [coordinator, membershipLifecycle, roomId],
  );
}
