"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type Ref } from "react";
import { ChatRoomCategoryBadges } from "@/components/chat-room-category-badges";
import {
  useChatRoomSettingsControl,
  type ChatRoomSettingsControlController,
} from "@/components/use-chat-room-settings-control";
import type { RoomDetails } from "@/lib/chat/chat-room-contracts";

export function ChatRoomInformationSection({
  canEdit,
  room,
}: {
  canEdit: boolean;
  room: RoomDetails;
}) {
  return canEdit ? (
    <ChatRoomSettingsControl room={room} />
  ) : (
    <ChatRoomInformationCard room={room} />
  );
}

export function ChatRoomSettingsControl({ room }: { room: RoomDetails }) {
  const controller = useChatRoomSettingsControl(room);
  const [isEditing, setIsEditing] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const visibleIsEditing = isEditing && controller.completionMessage === null;

  function closeEditor() {
    setIsEditing(false);
    requestAnimationFrame(() => editButtonRef.current?.focus());
  }

  useEffect(() => {
    if (!controller.completionMessage) {
      return;
    }

    requestAnimationFrame(() => editButtonRef.current?.focus());
  }, [controller.completionMessage]);

  return (
    <ChatRoomSettingsControlView
      controller={controller}
      editButtonRef={editButtonRef}
      isEditing={visibleIsEditing}
      onCancel={closeEditor}
      onEdit={() => {
        controller.reset();
        setIsEditing(true);
      }}
      room={room}
    />
  );
}

export function ChatRoomSettingsControlView({
  controller,
  editButtonRef,
  isEditing,
  onCancel,
  onEdit,
  room,
}: {
  controller: ChatRoomSettingsControlController;
  editButtonRef?: Ref<HTMLButtonElement>;
  isEditing: boolean;
  onCancel: () => void;
  onEdit: () => void;
  room: RoomDetails;
}) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="mt-4 rounded-xl bg-[var(--chat-publishing-color-neutral-soft)] p-4"
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-slate-950" id={titleId}>
          방 정보
        </h3>
        {!isEditing ? (
          <button
            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-border)] bg-white px-3 text-sm font-bold text-[var(--chat-publishing-color-text)] transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
            onClick={onEdit}
            ref={editButtonRef}
            type="button"
          >
            수정하기
          </button>
        ) : null}
      </div>

      {controller.completionMessage ? (
        <p
          className="mt-3 rounded-[var(--chat-publishing-radius-control)] border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
          role="status"
        >
          {controller.completionMessage}
        </p>
      ) : null}

      {isEditing ? (
        <ChatRoomSettingsInlineForm
          controller={controller}
          key={`${room.roomId}:${room.version}`}
          onCancel={onCancel}
          room={room}
          titleId={titleId}
        />
      ) : (
        <RoomInformationDetails room={room} />
      )}
    </section>
  );
}

export function ChatRoomSettingsInlineForm({
  controller,
  onCancel,
  room,
  titleId,
}: {
  controller: ChatRoomSettingsControlController;
  onCancel: () => void;
  room: RoomDetails;
  titleId: string;
}) {
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
      className="mt-4 grid gap-4"
      onChange={controller.clearFailedAttempt}
      onReset={() => {
        controller.reset();
        onCancel();
      }}
      onSubmit={handleSubmit}
    >
      <fieldset className="grid gap-4" disabled={controller.isPending}>
        <label className="grid gap-2 text-sm font-bold text-[var(--chat-publishing-color-text)]">
          방 이름
          <input
            autoFocus
            className="min-h-12 rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-muted)] bg-white px-3 py-2 text-base font-normal text-[var(--chat-publishing-color-text)] outline-none transition focus:border-[var(--chat-publishing-color-primary)] focus:ring-2 focus:ring-[var(--chat-publishing-color-accent-soft)]"
            defaultValue={room.name}
            maxLength={100}
            name="name"
            required
          />
        </label>

        <div className="grid gap-2 text-sm text-[var(--chat-publishing-color-text)]">
          <label className="font-bold" htmlFor="room-settings-description">
            방 설명
          </label>
          <textarea
            aria-describedby="room-settings-description-help"
            className="min-h-28 resize-y rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-muted)] bg-white px-3 py-2 text-base text-[var(--chat-publishing-color-text)] outline-none transition focus:border-[var(--chat-publishing-color-primary)] focus:ring-2 focus:ring-[var(--chat-publishing-color-accent-soft)]"
            defaultValue={room.description}
            id="room-settings-description"
            maxLength={500}
            name="description"
            rows={4}
          />
          <span
            className="text-xs leading-[18px] text-[var(--chat-publishing-color-muted)]"
            id="room-settings-description-help"
          >
            빈 값으로 저장하면 설명을 제거합니다. 최대 500자의 일반 텍스트입니다.
          </span>
        </div>
      </fieldset>

      {controller.validationMessage ? (
        <p
          className="rounded-[var(--chat-publishing-radius-control)] border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {controller.validationMessage}
        </p>
      ) : null}

      {controller.errorMessage ? (
        <div
          className="rounded-[var(--chat-publishing-radius-control)] border border-red-200 bg-red-50 p-3 text-red-950"
          role="alert"
        >
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

      <div className="mt-1 grid grid-cols-2 gap-2">
        <button className="secondary-button" disabled={controller.isPending} type="reset">
          취소
        </button>
        <button className="primary-button" disabled={controller.isPending} type="submit">
          {controller.isPending ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}

function ChatRoomInformationCard({ room }: { room: RoomDetails }) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="mt-4 rounded-xl bg-[var(--chat-publishing-color-neutral-soft)] p-4"
    >
      <h3 className="text-lg font-bold text-slate-950" id={titleId}>
        방 정보
      </h3>
      <RoomInformationDetails room={room} />
    </section>
  );
}

function RoomInformationDetails({ room }: { room: RoomDetails }) {
  return (
    <div className="mt-4 grid gap-3">
      <p className="break-words text-base font-bold leading-6 text-[var(--chat-publishing-color-text)]">
        {room.name}
      </p>
      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
        {room.description || "채팅방 소개가 없습니다."}
      </p>
      <ChatRoomCategoryBadges categories={room.categories} />
    </div>
  );
}
