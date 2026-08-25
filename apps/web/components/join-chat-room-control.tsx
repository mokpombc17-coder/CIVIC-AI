"use client";

import { useJoinChatRoom } from "@/components/use-join-chat-room";
import type { PublicRoomListItem } from "@/lib/chat/chat-room-contracts";

export function JoinChatRoomControl({ room }: { room: PublicRoomListItem }) {
  const join = useJoinChatRoom(room);

  if (!join.isOpen) {
    return (
      <span className="inline-flex h-12 min-w-[108px] shrink-0 items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-border)] bg-[var(--chat-publishing-color-neutral-soft)] px-4 text-sm font-bold text-[var(--chat-publishing-color-muted)]">
        초대 전용
      </span>
    );
  }

  return (
    <div className="flex max-w-[140px] shrink-0 flex-col items-end gap-2">
      <button
        className="inline-flex h-12 min-w-[108px] items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-primary)] bg-white px-4 text-base font-bold text-[var(--chat-publishing-color-primary-emphasis)] transition hover:bg-[var(--chat-publishing-color-accent-soft)] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={join.isPending}
        onClick={join.join}
        type="button"
      >
        {join.isPending ? "참여 중…" : "참여하기"}
      </button>

      {join.errorMessage ? (
        <div className="text-right text-xs text-red-700" role="alert">
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
