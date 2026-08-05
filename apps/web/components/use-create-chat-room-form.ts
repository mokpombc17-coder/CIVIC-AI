"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { isRetryableChatCommandError } from "@/lib/chat/chat-command-retry";
import { createRoomRequestSchema, type CreateRoomRequest } from "@/lib/chat/chat-room-contracts";
import { useCreateRoomMutation } from "@/lib/chat/chat-room-mutations";
import { createIdempotentCommand, type IdempotentCommand } from "@/lib/chat/idempotent-command";

export function useCreateChatRoomForm() {
  const router = useRouter();
  const createRoom = useCreateRoomMutation();
  const [validationError, setValidationError] = useState<string | null>(null);
  const [retryCommand, setRetryCommand] = useState<IdempotentCommand<CreateRoomRequest> | null>(
    null,
  );

  function clearFailedAttempt() {
    setValidationError(null);

    if (retryCommand || createRoom.error) {
      setRetryCommand(null);
      createRoom.reset();
    }
  }

  function execute(command: IdempotentCommand<CreateRoomRequest>) {
    void createRoom
      .mutateAsync(command)
      .then((response) => router.push(`/chat/${response.roomId}`))
      .catch(() => undefined);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const request = createRoomRequestSchema.safeParse({
      name: formData.get("name"),
      description: formData.get("description"),
      visibility: formData.get("visibility"),
      joinPolicy: formData.get("joinPolicy"),
    });

    if (!request.success) {
      setValidationError(request.error.issues[0]?.message ?? "방 생성 정보를 확인해 주세요.");
      return;
    }

    createRoom.reset();
    setValidationError(null);

    const command = createIdempotentCommand(request.data);
    setRetryCommand(command);
    execute(command);
  }

  const canRetry =
    retryCommand !== null && createRoom.isError && isRetryableChatCommandError(createRoom.error);

  return {
    canRetry,
    clearFailedAttempt,
    errorMessage: createRoom.isError ? toErrorMessage(createRoom.error) : null,
    handleSubmit,
    isPending: createRoom.isPending,
    retry: () => {
      if (retryCommand) {
        execute(retryCommand);
      }
    },
    validationError,
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
