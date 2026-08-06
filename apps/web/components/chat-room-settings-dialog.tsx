"use client";

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { ChatRoomCategorySelector } from "@/components/chat-room-category-selector";
import { createRoomSettingsPatch } from "@/components/chat-room-settings-form";
import { isRetryableChatCommandError } from "@/lib/chat/chat-command-retry";
import type {
  RoomCategory,
  RoomDetails,
  UpdateRoomSettingsRequest,
} from "@/lib/chat/chat-room-contracts";
import { useUpdateRoomSettingsMutation } from "@/lib/chat/chat-room-mutations";
import { createIdempotentCommand, type IdempotentCommand } from "@/lib/chat/idempotent-command";

type RoomSettingsCompletion = "updated" | "unchanged";

export function ChatRoomSettingsControl({ room }: { room: RoomDetails }) {
  const [isOpen, setIsOpen] = useState(false);
  const [completion, setCompletion] = useState<RoomSettingsCompletion | null>(null);

  function openDialog() {
    setCompletion(null);
    setIsOpen(true);
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button className="secondary-button" onClick={openDialog} type="button">
        방 설정
      </button>
      {completion ? (
        <span className="text-xs text-emerald-700" role="status">
          {completion === "updated" ? "방 설정을 변경했습니다." : "변경된 설정이 없습니다."}
        </span>
      ) : null}
      {isOpen ? (
        <ChatRoomSettingsDialog
          onClose={() => setIsOpen(false)}
          onComplete={setCompletion}
          room={room}
        />
      ) : null}
    </div>
  );
}

function ChatRoomSettingsDialog({
  onClose,
  onComplete,
  room,
}: {
  onClose: () => void;
  onComplete: (completion: RoomSettingsCompletion) => void;
  room: RoomDetails;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const updateSettings = useUpdateRoomSettingsMutation();
  const [selectedCategory, setSelectedCategory] = useState<RoomCategory | null>(
    room.categories[0] ?? null,
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [retryCommand, setRetryCommand] =
    useState<IdempotentCommand<UpdateRoomSettingsRequest> | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    dialog.showModal();

    return () => {
      if (dialog.open) {
        dialog.close();
      }
    };
  }, []);

  function closeDialog() {
    if (!updateSettings.isPending) {
      onClose();
    }
  }

  function clearFailedAttempt() {
    setValidationError(null);

    if (retryCommand || updateSettings.error) {
      setRetryCommand(null);
      updateSettings.reset();
    }
  }

  async function execute(command: IdempotentCommand<UpdateRoomSettingsRequest>) {
    try {
      const response = await updateSettings.mutateAsync({
        roomId: room.roomId,
        command,
      });

      onComplete(response.code === "ROOM_SETTINGS_UPDATED" ? "updated" : "unchanged");
      onClose();
    } catch {
      // Mutation state renders the error and retains this command for an idempotent retry.
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const result = createRoomSettingsPatch(room, {
      name: formData.get("name"),
      description: formData.get("description"),
      categories: selectedCategory ? [selectedCategory] : [],
      visibility: formData.get("visibility"),
      joinPolicy: formData.get("joinPolicy"),
    });

    if (!result.success) {
      setValidationError(result.message);
      return;
    }

    if (!result.patch) {
      onComplete("unchanged");
      onClose();
      return;
    }

    updateSettings.reset();
    setValidationError(null);

    const command = createIdempotentCommand(result.patch);
    setRetryCommand(command);
    void execute(command);
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      closeDialog();
    }
  }

  const canRetry =
    retryCommand !== null &&
    updateSettings.isError &&
    isRetryableChatCommandError(updateSettings.error);

  return (
    <dialog
      aria-labelledby="room-settings-dialog-title"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-950 shadow-2xl backdrop:bg-slate-950/50"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      onClick={handleBackdropClick}
      ref={dialogRef}
    >
      <form className="grid gap-5 p-6" onChange={clearFailedAttempt} onSubmit={handleSubmit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Room settings</p>
            <h2 className="text-xl font-bold" id="room-settings-dialog-title">
              방 설정 변경
            </h2>
          </div>
          <button
            aria-label="방 설정 닫기"
            className="flex size-9 items-center justify-center rounded-full border border-slate-200 text-lg text-slate-600 transition hover:bg-slate-100"
            disabled={updateSettings.isPending}
            onClick={closeDialog}
            type="button"
          >
            ×
          </button>
        </div>

        <fieldset className="grid gap-4" disabled={updateSettings.isPending}>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            방 이름
            <input
              autoFocus
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950"
              defaultValue={room.name}
              maxLength={100}
              name="name"
              required
            />
          </label>

          <div className="grid gap-1 text-sm text-slate-700">
            <label className="font-medium" htmlFor="room-settings-description">
              방 설명
            </label>
            <textarea
              aria-describedby="room-settings-description-help"
              className="min-h-28 resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950"
              defaultValue={room.description}
              id="room-settings-description"
              name="description"
              rows={4}
            />
            <span className="text-xs text-slate-500" id="room-settings-description-help">
              빈 값으로 저장하면 설명을 제거합니다. 최대 500자의 일반 텍스트입니다.
            </span>
          </div>

          <ChatRoomCategorySelector
            disabled={updateSettings.isPending}
            onSelect={setSelectedCategory}
            selectedCategory={selectedCategory}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              공개 범위
              <select
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950"
                defaultValue={room.visibility}
                name="visibility"
              >
                <option value="LISTED">공개 목록에 표시</option>
                <option value="UNLISTED">목록에 표시하지 않음</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              참여 정책
              <select
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950"
                defaultValue={room.joinPolicy}
                name="joinPolicy"
              >
                <option value="OPEN">누구나 참여</option>
                <option value="INVITE_ONLY">신규 참여 제한</option>
              </select>
            </label>
          </div>

          <p className="-mt-2 text-xs text-slate-500">
            신규 참여 제한은 기존 멤버를 유지하지만, 현재 별도의 초대 기능은 제공하지 않습니다.
          </p>
        </fieldset>

        {validationError ? (
          <p
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            role="alert"
          >
            {validationError}
          </p>
        ) : null}

        {updateSettings.isError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-950" role="alert">
            <p className="text-sm font-semibold">방 설정을 변경하지 못했습니다.</p>
            <p className="mt-1 text-xs opacity-80">{toErrorMessage(updateSettings.error)}</p>
            {canRetry ? (
              <button
                className="secondary-button mt-3"
                disabled={updateSettings.isPending}
                onClick={() => void execute(retryCommand)}
                type="button"
              >
                같은 요청으로 다시 시도
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            className="secondary-button"
            disabled={updateSettings.isPending}
            onClick={closeDialog}
            type="button"
          >
            취소
          </button>
          <button className="primary-button" disabled={updateSettings.isPending} type="submit">
            {updateSettings.isPending ? "저장 중…" : "변경사항 저장"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
