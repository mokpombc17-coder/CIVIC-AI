"use client";

import { useId, useState, type FormEvent } from "react";
import { hasEditableRoomDetailsChanges } from "@/components/chat-room-settings-form";
import {
  useChatRoomSettingsControl,
  type ChatRoomSettingsControlController,
} from "@/components/use-chat-room-settings-control";
import { ChatRoomCategoryBadges } from "@/components/chat-room-category-badges";
import type { RoomDetails } from "@/lib/chat/chat-room-contracts";

const SETTINGS_PRIMARY_BUTTON_CLASS_NAME =
  "inline-flex min-h-12 items-center justify-center rounded-[var(--chat-publishing-radius-control)] bg-[var(--chat-publishing-color-primary)] px-4 text-base font-bold text-white transition hover:bg-[var(--chat-publishing-color-primary-emphasis)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)] disabled:cursor-not-allowed disabled:opacity-50";
const SETTINGS_SECONDARY_BUTTON_CLASS_NAME =
  "inline-flex min-h-12 items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-border)] bg-white px-4 text-base font-bold text-[var(--chat-publishing-color-text)] transition hover:bg-[var(--chat-publishing-color-neutral-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)] disabled:cursor-not-allowed disabled:opacity-50";

export function ChatRoomInformationSection({
  canEdit,
  room,
}: {
  canEdit: boolean;
  room: RoomDetails;
}) {
  const [isEditing, setIsEditing] = useState(false);

  return canEdit && isEditing ? (
    <ChatRoomSettingsControl onCancel={() => setIsEditing(false)} room={room} />
  ) : (
    <ChatRoomInformationCard
      {...(canEdit ? { onEdit: () => setIsEditing(true) } : {})}
      room={room}
    />
  );
}

export function ChatRoomSettingsControl({
  onCancel,
  room,
}: {
  onCancel?: () => void;
  room: RoomDetails;
}) {
  const controller = useChatRoomSettingsControl(room);

  return (
    <ChatRoomSettingsControlView
      controller={controller}
      {...(onCancel === undefined ? {} : { onCancel })}
      room={room}
    />
  );
}

export function ChatRoomSettingsControlView({
  controller,
  onCancel,
  room,
}: {
  controller: ChatRoomSettingsControlController;
  onCancel?: () => void;
  room: RoomDetails;
}) {
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="py-5">
      <div className="flex min-h-10 items-center justify-between gap-3">
        <h3
          className="text-base font-semibold text-[var(--chat-publishing-color-text)]"
          id={titleId}
        >
          {onCancel ? "방 정보 수정" : "방 정보"}
        </h3>
        {onCancel ? (
          <button
            className="inline-flex min-h-10 items-center justify-center rounded-[var(--chat-publishing-radius-control)] px-3 text-sm font-semibold text-[var(--chat-publishing-color-muted)] transition hover:bg-[var(--chat-publishing-color-neutral-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
            onClick={onCancel}
            type="button"
          >
            취소
          </button>
        ) : null}
      </div>

      {controller.completionMessage ? (
        <p
          className="mt-3 rounded-[var(--chat-publishing-radius-control)] bg-[var(--chat-publishing-color-accent-soft)] p-3 text-sm leading-6 text-[var(--chat-publishing-color-primary-emphasis)]"
          role="status"
        >
          {controller.completionMessage}
        </p>
      ) : null}

      <ChatRoomSettingsInlineForm
        controller={controller}
        key={`${room.roomId}:${room.version}`}
        room={room}
        titleId={titleId}
      />
    </section>
  );
}

export function ChatRoomSettingsInlineForm({
  controller,
  room,
  titleId,
}: {
  controller: ChatRoomSettingsControlController;
  room: RoomDetails;
  titleId: string;
}) {
  const descriptionId = useId();
  const descriptionHelpId = `${descriptionId}-help`;
  const [draft, setDraft] = useState({
    description: room.description,
    name: room.name,
  });
  const hasChanges = hasEditableRoomDetailsChanges(room, draft);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    controller.submit(draft);
  }

  return (
    <form
      aria-labelledby={titleId}
      className="mt-4 grid gap-4"
      onChange={controller.clearFailedAttempt}
      onSubmit={handleSubmit}
    >
      <fieldset className="grid gap-4" disabled={controller.isPending}>
        <div className="grid gap-1">
          <span className="text-xs font-medium text-[var(--chat-publishing-color-muted)]">
            카테고리
          </span>
          <ChatRoomCategoryBadges categories={room.categorySummaries} maxVisible={5} />
        </div>

        <label className="grid gap-1 text-xs font-medium text-[var(--chat-publishing-color-muted)]">
          방 이름
          <input
            className="-mx-2 min-h-10 w-[calc(100%+1rem)] rounded-[var(--chat-publishing-radius-control)] border border-transparent bg-transparent px-2 py-1 text-base font-bold text-[var(--chat-publishing-color-text)] outline-none transition focus:border-[var(--chat-publishing-color-primary)] focus:bg-white focus:ring-2 focus:ring-[var(--chat-publishing-color-accent-soft)]"
            maxLength={100}
            name="name"
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            required
            value={draft.name}
          />
        </label>

        <div className="grid gap-1 text-[var(--chat-publishing-color-text)]">
          <label
            className="text-xs font-medium text-[var(--chat-publishing-color-muted)]"
            htmlFor={descriptionId}
          >
            방 설명
          </label>
          <textarea
            aria-describedby={descriptionHelpId}
            className="-mx-2 min-h-16 w-[calc(100%+1rem)] resize-none rounded-[var(--chat-publishing-radius-control)] border border-transparent bg-transparent px-2 py-1 text-sm leading-6 text-[var(--chat-publishing-color-text)] outline-none transition focus:border-[var(--chat-publishing-color-primary)] focus:bg-white focus:ring-2 focus:ring-[var(--chat-publishing-color-accent-soft)]"
            id={descriptionId}
            maxLength={500}
            name="description"
            onChange={(event) =>
              setDraft((current) => ({ ...current, description: event.target.value }))
            }
            placeholder="토론방 소개가 없습니다."
            rows={2}
            value={draft.description}
          />
          <span className="sr-only" id={descriptionHelpId}>
            빈 값으로 저장하면 설명을 제거합니다. 최대 500자의 일반 텍스트입니다.
          </span>
        </div>
      </fieldset>

      {controller.validationMessage ? (
        <p
          className="rounded-[var(--chat-publishing-radius-control)] border border-[#ffc95c] bg-[#fff7e8] p-3 text-sm text-[#b42318]"
          role="alert"
        >
          {controller.validationMessage}
        </p>
      ) : null}

      {controller.errorMessage ? (
        <div
          className="rounded-[var(--chat-publishing-radius-control)] border border-[#ffc95c] bg-[#fff7e8] p-3 text-[var(--chat-publishing-color-text)]"
          role="alert"
        >
          <p className="text-sm font-semibold">방 정보를 수정하지 못했습니다.</p>
          <p className="mt-1 text-xs leading-5 text-[var(--chat-publishing-color-muted)]">
            {controller.errorMessage}
          </p>
          {controller.canRetry ? (
            <button
              className={`${SETTINGS_SECONDARY_BUTTON_CLASS_NAME} mt-3`}
              disabled={controller.isPending}
              onClick={controller.retry}
              type="button"
            >
              같은 요청으로 다시 시도
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-1 flex justify-end">
        <button
          className={`${SETTINGS_PRIMARY_BUTTON_CLASS_NAME} min-w-[108px]`}
          disabled={!hasChanges || controller.isPending}
          type="submit"
        >
          {controller.isPending ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}

function ChatRoomInformationCard({ onEdit, room }: { onEdit?: () => void; room: RoomDetails }) {
  return (
    <section aria-label="방 정보" className="py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <ChatRoomCategoryBadges categories={room.categorySummaries} maxVisible={5} />
          <h3 className="mt-3 break-words text-lg font-semibold leading-7 text-[var(--chat-publishing-color-text)]">
            {room.name}
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--chat-publishing-color-muted)]">
            {room.description || "토론방 소개가 없습니다."}
          </p>
        </div>
        {onEdit ? (
          <button
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-[var(--chat-publishing-radius-control)] px-3 text-sm font-semibold text-[var(--chat-publishing-color-primary-emphasis)] transition hover:bg-[var(--chat-publishing-color-accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
            onClick={onEdit}
            type="button"
          >
            수정
          </button>
        ) : null}
      </div>
    </section>
  );
}
