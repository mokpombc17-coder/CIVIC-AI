"use client";

import { useEffect, useRef, type FormEvent, type MouseEvent } from "react";
import { ChatRoomCategorySelector } from "@/components/chat-room-category-selector";
import {
  useChatRoomSettingsControl,
  type ChatRoomSettingsControlController,
} from "@/components/use-chat-room-settings-control";
import type { RoomDetails } from "@/lib/chat/chat-room-contracts";

export function ChatRoomSettingsControl({ room }: { room: RoomDetails }) {
  const controller = useChatRoomSettingsControl(room);

  return <ChatRoomSettingsControlView controller={controller} room={room} />;
}

export function ChatRoomSettingsControlView({
  controller,
  room,
}: {
  controller: ChatRoomSettingsControlController;
  room: RoomDetails;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button className="secondary-button" onClick={controller.open} type="button">
        방 설정
      </button>
      {controller.completionMessage ? (
        <span className="text-xs text-emerald-700" role="status">
          {controller.completionMessage}
        </span>
      ) : null}
      {controller.isOpen ? (
        <ChatRoomSettingsDialogView controller={controller} room={room} />
      ) : null}
    </div>
  );
}

export function ChatRoomSettingsDialogView({
  controller,
  room,
}: {
  controller: ChatRoomSettingsControlController;
  room: RoomDetails;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    controller.submit({
      name: formData.get("name"),
      description: formData.get("description"),
      categories: controller.selectedCategory ? [controller.selectedCategory] : [],
      visibility: formData.get("visibility"),
      joinPolicy: formData.get("joinPolicy"),
    });
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      controller.close();
    }
  }

  return (
    <dialog
      aria-labelledby="room-settings-dialog-title"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-950 shadow-2xl backdrop:bg-slate-950/50"
      onCancel={(event) => {
        event.preventDefault();
        controller.close();
      }}
      onClick={handleBackdropClick}
      ref={dialogRef}
    >
      <form
        className="grid gap-5 p-6"
        onChange={controller.clearFailedAttempt}
        onSubmit={handleSubmit}
      >
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
            disabled={controller.isPending}
            onClick={controller.close}
            type="button"
          >
            ×
          </button>
        </div>

        <fieldset className="grid gap-4" disabled={controller.isPending}>
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
            disabled={controller.isPending}
            onSelect={controller.selectCategory}
            selectedCategory={controller.selectedCategory}
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

        {controller.validationMessage ? (
          <p
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            role="alert"
          >
            {controller.validationMessage}
          </p>
        ) : null}

        {controller.errorMessage ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-950" role="alert">
            <p className="text-sm font-semibold">방 설정을 변경하지 못했습니다.</p>
            <p className="mt-1 text-xs opacity-80">{controller.errorMessage}</p>
            {controller.canRetry ? (
              <button
                className="secondary-button mt-3"
                disabled={controller.isPending}
                onClick={controller.retry}
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
            disabled={controller.isPending}
            onClick={controller.close}
            type="button"
          >
            취소
          </button>
          <button className="primary-button" disabled={controller.isPending} type="submit">
            {controller.isPending ? "저장 중…" : "변경사항 저장"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
