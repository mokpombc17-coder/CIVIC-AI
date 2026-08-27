"use client";

import { useJoinChatRoom } from "@/components/use-join-chat-room";
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

  return (
    <div
      className={
        isSheet
          ? "grid w-full justify-items-start gap-2"
          : "flex max-w-[140px] shrink-0 flex-col items-end gap-2"
      }
    >
      <button
        className={`inline-flex h-12 items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-primary)] px-4 text-base font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
          isSheet
            ? "w-fit bg-[var(--chat-publishing-color-primary)] text-white hover:bg-[var(--chat-publishing-color-primary-emphasis)]"
            : "min-w-[108px] bg-white text-[var(--chat-publishing-color-primary-emphasis)] hover:bg-[var(--chat-publishing-color-accent-soft)]"
        }`}
        disabled={join.isPending}
        onClick={join.join}
        type="button"
      >
        {join.isPending ? "참여 중…" : "참여하기"}
      </button>

      {join.errorMessage ? (
        <div
          className={isSheet ? "text-left text-xs text-red-700" : "text-right text-xs text-red-700"}
          role="alert"
        >
          <p>{join.errorMessage}</p>
          {join.canRetry ? (
            <button
              className="mt-1 underline underline-offset-2"
              onClick={join.retry}
              type="button"
            >
              같은 요청으로 다시 시도
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
