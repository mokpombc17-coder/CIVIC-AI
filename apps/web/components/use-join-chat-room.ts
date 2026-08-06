"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isRetryableChatCommandError } from "@/lib/chat/chat-command-retry";
import { getJoinRoomErrorMessage } from "@/lib/chat/chat-room-command-error-presentation";
import { invalidatePublicRoomListsAfterJoinError } from "@/lib/chat/chat-room-cache-effects";
import type { PublicRoomListItem } from "@/lib/chat/chat-room-contracts";
import { useJoinRoomMutation } from "@/lib/chat/chat-room-mutations";
import { createIdempotentCommand, type IdempotentCommand } from "@/lib/chat/idempotent-command";

export function useJoinChatRoom(room: PublicRoomListItem) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const joinRoom = useJoinRoomMutation();
  const [retryCommand, setRetryCommand] = useState<IdempotentCommand<undefined> | null>(null);

  function execute(command: IdempotentCommand<undefined>) {
    void joinRoom
      .mutateAsync({
        roomId: room.roomId,
        command,
      })
      .then(() => router.push(`/chat/${room.roomId}`))
      .catch((error: unknown) => {
        void invalidatePublicRoomListsAfterJoinError(queryClient, error).catch(() => undefined);
      });
  }

  function join() {
    joinRoom.reset();

    const command = createIdempotentCommand(undefined);
    setRetryCommand(command);
    execute(command);
  }

  const canRetry =
    retryCommand !== null && joinRoom.isError && isRetryableChatCommandError(joinRoom.error);

  return {
    canRetry,
    errorMessage: joinRoom.isError ? getJoinRoomErrorMessage(joinRoom.error) : null,
    isOpen: room.joinPolicy === "OPEN",
    isPending: joinRoom.isPending,
    join,
    retry: () => {
      if (retryCommand) {
        execute(retryCommand);
      }
    },
  };
}
