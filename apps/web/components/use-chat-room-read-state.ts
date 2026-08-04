"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useUpdateRoomReadStateMutation } from "@/lib/chat/chat-room-mutations";
import { ChatRoomReadStateScheduler } from "@/lib/chat/chat-room-read-state-scheduler";

export function useChatRoomReadState(roomId: string): (throughSequence: number) => void {
  const mutation = useUpdateRoomReadStateMutation();
  const { mutateAsync } = mutation;

  const scheduler = useMemo(
    () =>
      new ChatRoomReadStateScheduler({
        submit: async (throughSequence) => {
          const response = await mutateAsync({
            request: { throughSequence },
            roomId,
          });
          return response.readThroughSequence;
        },
      }),
    [mutateAsync, roomId],
  );

  useEffect(
    () => () => {
      scheduler.flush();
    },
    [scheduler],
  );

  return useCallback(
    (throughSequence: number) => {
      scheduler.schedule(throughSequence);
    },
    [scheduler],
  );
}
