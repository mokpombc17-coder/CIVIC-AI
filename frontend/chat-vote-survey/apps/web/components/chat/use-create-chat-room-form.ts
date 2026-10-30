"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  parseCreateChatRoomFormData,
  resolveCreateChatRoomResultDestination,
} from "@/components/chat/create-chat-room-form-model";
import { isRetryableChatCommandError } from "@/lib/chat/chat-command-retry";
import { getCreateRoomErrorMessage } from "@/lib/chat/chat-room-command-error-presentation";
import type { CreateRoomRequest, CreateRoomResponse } from "@/lib/chat/chat-room-contracts";
import { useCreateRoomMutation } from "@/lib/chat/chat-room-mutations";
import { createIdempotentCommand, type IdempotentCommand } from "@/lib/chat/idempotent-command";

export function useCreateChatRoomForm() {
  const router = useRouter();
  const createRoom = useCreateRoomMutation();
  const [creationRequestResult, setCreationRequestResult] = useState<Exclude<
    CreateRoomResponse,
    { status: "APPROVED" }
  > | null>(null);
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
      .then((response) => {
        const destination = resolveCreateChatRoomResultDestination(response);

        if (destination.kind === "room") {
          router.push(destination.href);
          return;
        }

        setCreationRequestResult(destination.response);
      })
      .catch(() => undefined);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const request = parseCreateChatRoomFormData(new FormData(event.currentTarget));

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

  function startNewRequest() {
    setCreationRequestResult(null);
    setRetryCommand(null);
    setValidationError(null);
    createRoom.reset();
  }

  return {
    canRetry,
    canSubmit: !createRoom.isPending,
    clearFailedAttempt,
    creationRequestResult,
    errorMessage: createRoom.isError ? getCreateRoomErrorMessage(createRoom.error) : null,
    handleSubmit,
    isPending: createRoom.isPending,
    startNewRequest,
    retry: () => {
      if (retryCommand) {
        execute(retryCommand);
      }
    },
    validationError,
  };
}
