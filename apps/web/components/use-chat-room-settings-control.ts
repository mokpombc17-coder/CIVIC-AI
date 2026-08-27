"use client";

import { useState } from "react";
import {
  createEditableRoomDetailsPatch,
  type RoomEditableDetailsDraft,
} from "@/components/chat-room-settings-form";
import { isRetryableChatCommandError } from "@/lib/chat/chat-command-retry";
import type { RoomDetails, UpdateRoomSettingsRequest } from "@/lib/chat/chat-room-contracts";
import { useUpdateRoomSettingsMutation } from "@/lib/chat/chat-room-mutations";
import { createIdempotentCommand, type IdempotentCommand } from "@/lib/chat/idempotent-command";

type RoomSettingsCompletion = "updated" | "unchanged";

export type ChatRoomSettingsControlController = Readonly<{
  canRetry: boolean;
  clearFailedAttempt: () => void;
  completionMessage: string | null;
  errorMessage: string | null;
  isPending: boolean;
  reset: () => void;
  retry: () => void;
  submit: (draft: RoomEditableDetailsDraft) => void;
  validationMessage: string | null;
}>;

const COMPLETION_MESSAGE: Record<RoomSettingsCompletion, string> = {
  updated: "방 정보를 수정했습니다.",
  unchanged: "변경된 방 정보가 없습니다.",
};

export function useChatRoomSettingsControl(room: RoomDetails): ChatRoomSettingsControlController {
  const updateSettings = useUpdateRoomSettingsMutation();
  const [completion, setCompletion] = useState<RoomSettingsCompletion | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [retryCommand, setRetryCommand] =
    useState<IdempotentCommand<UpdateRoomSettingsRequest> | null>(null);

  async function execute(command: IdempotentCommand<UpdateRoomSettingsRequest>) {
    try {
      const response = await updateSettings.mutateAsync({
        roomId: room.roomId,
        command,
      });

      setCompletion(response.code === "ROOM_SETTINGS_UPDATED" ? "updated" : "unchanged");
    } catch {
      // Mutation state renders the error and retains this command for an idempotent retry.
    }
  }

  function clearFailedAttempt() {
    setCompletion(null);
    setValidationMessage(null);

    if (retryCommand || updateSettings.error) {
      setRetryCommand(null);
      updateSettings.reset();
    }
  }

  function reset() {
    if (updateSettings.isPending) {
      return;
    }

    setCompletion(null);
    setRetryCommand(null);
    setValidationMessage(null);
    updateSettings.reset();
  }

  function submit(draft: RoomEditableDetailsDraft) {
    const result = createEditableRoomDetailsPatch(room, draft);

    if (!result.success) {
      setValidationMessage(result.message);
      return;
    }

    if (!result.patch) {
      setCompletion("unchanged");
      return;
    }

    updateSettings.reset();
    setValidationMessage(null);

    const command = createIdempotentCommand(result.patch);
    setRetryCommand(command);
    void execute(command);
  }

  const canRetry =
    retryCommand !== null &&
    updateSettings.isError &&
    isRetryableChatCommandError(updateSettings.error);

  return {
    canRetry,
    clearFailedAttempt,
    completionMessage: completion ? COMPLETION_MESSAGE[completion] : null,
    errorMessage: updateSettings.isError ? toErrorMessage(updateSettings.error) : null,
    isPending: updateSettings.isPending,
    reset,
    retry: () => {
      if (retryCommand) {
        void execute(retryCommand);
      }
    },
    submit,
    validationMessage,
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
