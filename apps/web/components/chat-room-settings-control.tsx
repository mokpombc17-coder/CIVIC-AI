"use client";

import { useId, type FormEvent } from "react";
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
    <div className="mt-4 grid gap-3">
      {controller.completionMessage ? (
        <p
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
          role="status"
        >
          {controller.completionMessage}
        </p>
      ) : null}
      <ChatRoomSettingsInlineForm
        controller={controller}
        key={`${room.roomId}:${room.version}`}
        room={room}
      />
    </div>
  );
}

export function ChatRoomSettingsInlineForm({
  controller,
  room,
}: {
  controller: ChatRoomSettingsControlController;
  room: RoomDetails;
}) {
  const titleId = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    controller.submit({
      name: formData.get("name"),
      description: formData.get("description"),
    });
  }

  return (
    <form
      aria-labelledby={titleId}
      className="grid gap-4 rounded-xl border border-[var(--chat-publishing-color-border)] bg-white p-4"
      onChange={controller.clearFailedAttempt}
      onReset={controller.reset}
      onSubmit={handleSubmit}
    >
      <h3 className="text-lg font-bold text-slate-950" id={titleId}>
        방 정보 수정
      </h3>

      <fieldset className="grid gap-4" disabled={controller.isPending}>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          방 이름
          <input
            className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-950"
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
            className="min-h-28 resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-950"
            defaultValue={room.description}
            id="room-settings-description"
            maxLength={500}
            name="description"
            rows={4}
          />
          <span className="text-xs text-slate-500" id="room-settings-description-help">
            빈 값으로 저장하면 설명을 제거합니다. 최대 500자의 일반 텍스트입니다.
          </span>
        </div>
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
          <p className="text-sm font-semibold">방 정보를 수정하지 못했습니다.</p>
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

      <div className="grid grid-cols-2 gap-2">
        <button className="secondary-button" disabled={controller.isPending} type="reset">
          되돌리기
        </button>
        <button className="primary-button" disabled={controller.isPending} type="submit">
          {controller.isPending ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}
