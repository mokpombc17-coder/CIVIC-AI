"use client";

import { useJoinChatRoom } from "@/components/chat/use-join-chat-room";
import type { PublicRoomListItem } from "@/lib/chat/chat-room-contracts";

export function JoinChatRoomControl({
  appearance = "card",
  room,
}: {
  appearance?: "card" | "sheet";
  room: PublicRoomListItem;
}) {
  const join = useJoinChatRoom(room);
  const isSheet = appearance === "sheet";

  if (!join.isOpen) {
    return (
      <span
        className={`inline-flex h-12 items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-border)] bg-[var(--chat-publishing-color-neutral-soft)] px-4 text-sm font-bold text-[var(--chat-publishing-color-muted)] ${
          isSheet ? "w-fit" : "min-w-[108px] shrink-0"
        }`}
      >
        초대 전용
      </span>
    );
  }

  const errorFeedback = join.errorMessage ? (
    <div
      className={`rounded-[var(--chat-publishing-radius-control)] border border-[#ffc95c] bg-[#fff7e8] px-3 py-2.5 text-left text-xs leading-5 text-[#7a4b00] ${
        isSheet ? "w-full" : "max-w-[140px]"
      }`}
      data-chat-form-feedback="request-error"
      role="alert"
    >
      <p className="font-semibold">{join.errorMessage}</p>
      {join.canRetry ? (
        <button
          className="mt-2 font-bold text-[var(--chat-publishing-color-primary-emphasis)] underline underline-offset-2"
          onClick={join.retry}
          type="button"
        >
          같은 요청으로 다시 시도
        </button>
      ) : null}
    </div>
  ) : null;

  return (
    <div
      className={
        isSheet ? "grid w-full gap-2" : "flex max-w-[140px] shrink-0 flex-col items-end gap-2"
      }
    >
      {isSheet ? errorFeedback : null}

      <button
        className={`inline-flex h-12 items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-primary)] px-4 text-base font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
          isSheet
            ? "w-full bg-[var(--chat-publishing-color-primary)] text-white hover:bg-[var(--chat-publishing-color-primary-emphasis)]"
            : "min-w-[108px] bg-white text-[var(--chat-publishing-color-primary-emphasis)] hover:bg-[var(--chat-publishing-color-accent-soft)]"
        }`}
        disabled={join.isPending}
        onClick={join.join}
        type="button"
      >
        {join.isPending ? "참여 중…" : "참여하기"}
      </button>

      {isSheet ? null : errorFeedback}
    </div>
  );
}
