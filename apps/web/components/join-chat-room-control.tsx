"use client";

import { useJoinChatRoom } from "@/components/use-join-chat-room";
import type { PublicRoomListItem } from "@/lib/chat/chat-room-contracts";

export function JoinChatRoomControl({ room }: { room: PublicRoomListItem }) {
  const join = useJoinChatRoom(room);

  if (!join.isOpen) {
    return (
      <span className="inline-flex min-h-[2.6rem] shrink-0 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-500">
        초대 전용
      </span>
    );
  }

  return (
    <div className="flex max-w-64 shrink-0 flex-col items-end gap-2">
      <button
        className="secondary-button"
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
