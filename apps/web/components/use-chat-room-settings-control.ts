"use client";

import { useState } from "react";
import {
  createRoomSettingsPatch,
  type RoomSettingsDraft,
} from "@/components/chat-room-settings-form";
import { isRetryableChatCommandError } from "@/lib/chat/chat-command-retry";
import type {
  RoomCategory,
  RoomDetails,
  UpdateRoomSettingsRequest,
} from "@/lib/chat/chat-room-contracts";
import { useUpdateRoomSettingsMutation } from "@/lib/chat/chat-room-mutations";
import { createIdempotentCommand, type IdempotentCommand } from "@/lib/chat/idempotent-command";

type RoomSettingsCompletion = "updated" | "unchanged";

export type ChatRoomSettingsControlController = Readonly<{
  canRetry: boolean;
  clearFailedAttempt: () => void;
  close: () => void;
  completionMessage: string | null;
  errorMessage: string | null;
  isOpen: boolean;
  isPending: boolean;
  open: () => void;
  retry: () => void;
  selectedCategory: RoomCategory | null;
  selectCategory: (category: RoomCategory) => void;
  submit: (draft: RoomSettingsDraft) => void;
  validationMessage: string | null;
}>;

const COMPLETION_MESSAGE: Record<RoomSettingsCompletion, string> = {
  updated: "방 설정을 변경했습니다.",
  unchanged: "변경된 설정이 없습니다.",
};

export function useChatRoomSettingsControl(room: RoomDetails): ChatRoomSettingsControlController {
  const updateSettings = useUpdateRoomSettingsMutation();
  const [isOpen, setIsOpen] = useState(false);
  const [completion, setCompletion] = useState<RoomSettingsCompletion | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<RoomCategory | null>(
    room.categories[0] ?? null,
  );
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [retryCommand, setRetryCommand] =
    useState<IdempotentCommand<UpdateRoomSettingsRequest> | null>(null);

  function complete(nextCompletion: RoomSettingsCompletion) {
    setCompletion(nextCompletion);
    setIsOpen(false);
  }

  async function execute(command: IdempotentCommand<UpdateRoomSettingsRequest>) {
    try {
      const response = await updateSettings.mutateAsync({
        roomId: room.roomId,
        command,
      });

      complete(response.code === "ROOM_SETTINGS_UPDATED" ? "updated" : "unchanged");
    } catch {
      // Mutation state renders the error and retains this command for an idempotent retry.
    }
  }

  function open() {
    updateSettings.reset();
    setCompletion(null);
    setRetryCommand(null);
    setSelectedCategory(room.categories[0] ?? null);
    setValidationMessage(null);
    setIsOpen(true);
  }

  function close() {
    if (!updateSettings.isPending) {
      setIsOpen(false);
    }
  }

  function clearFailedAttempt() {
    setValidationMessage(null);

    if (retryCommand || updateSettings.error) {
      setRetryCommand(null);
      updateSettings.reset();
    }
  }

  function submit(draft: RoomSettingsDraft) {
    const result = createRoomSettingsPatch(room, draft);

    if (!result.success) {
      setValidationMessage(result.message);
      return;
    }

    if (!result.patch) {
      complete("unchanged");
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
    close,
    completionMessage: completion ? COMPLETION_MESSAGE[completion] : null,
    errorMessage: updateSettings.isError ? toErrorMessage(updateSettings.error) : null,
    isOpen,
    isPending: updateSettings.isPending,
    open,
    retry: () => {
      if (retryCommand) {
        void execute(retryCommand);
      }
    },
    selectedCategory,
    selectCategory: setSelectedCategory,
    submit,
    validationMessage,
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
