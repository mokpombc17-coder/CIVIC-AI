"use client";

import { useChatRealtimeRoom } from "@/components/chat-realtime-provider";
import { getChatRoomSessionView } from "@/lib/chat/realtime/chat-room-session-view";

export function ChatRoomSessionControls({ roomId }: { roomId: string }) {
  const session = useChatRealtimeRoom(roomId);
  const view = getChatRoomSessionView(session, roomId);
  const isUnavailable = view.kind !== "active";

  return (
    <>
      <div
        aria-live="polite"
        className={`border-t px-5 py-4 ${
          view.kind === "active"
            ? "border-emerald-200 bg-emerald-50 text-emerald-950"
            : view.kind === "replaced"
              ? "border-amber-200 bg-amber-50 text-amber-950"
              : view.kind === "error"
                ? "border-red-200 bg-red-50 text-red-950"
                : "border-slate-200 bg-slate-50 text-slate-800"
        }`}
        role={view.kind === "error" || view.kind === "replaced" ? "alert" : "status"}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{view.title}</p>
            <p className="mt-1 text-xs opacity-75">{view.description}</p>
          </div>

          {view.canReactivate ? (
            <button className="secondary-button" onClick={session.reactivate} type="button">
              이 탭에서 다시 활성화
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex gap-3 border-t border-slate-200 bg-white p-4">
        <label className="sr-only" htmlFor={`chat-message-${roomId}`}>
          메시지
        </label>
        <input
          className={`min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 ${
            isUnavailable
              ? "cursor-not-allowed bg-slate-100 text-slate-500"
              : "bg-white text-slate-950"
          }`}
          disabled={!view.canDraft}
          id={`chat-message-${roomId}`}
          placeholder={
            view.canDraft
              ? "메시지 전송 연동 전입니다. 초안만 입력할 수 있습니다."
              : "이 탭을 활성화하면 메시지를 입력할 수 있습니다."
          }
        />
        <button
          className="primary-button cursor-not-allowed opacity-50"
          disabled
          title="메시지 payload 연동 후 활성화됩니다."
          type="button"
        >
          전송
        </button>
      </div>
    </>
  );
}
