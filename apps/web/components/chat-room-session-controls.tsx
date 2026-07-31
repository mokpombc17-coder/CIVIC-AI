"use client";

import type { ChatRealtimeRoomState } from "@/components/chat-realtime-provider";
import { useChatMessageComposer } from "@/components/use-chat-message-composer";
import { getChatRoomSessionView } from "@/lib/chat/realtime/chat-room-session-view";

type ChatRoomSessionControlsProps = Readonly<{
  realtimeReady: boolean;
  roomId: string;
  session: ChatRealtimeRoomState;
}>;

export function ChatRoomSessionControls({
  realtimeReady,
  roomId,
  session,
}: ChatRoomSessionControlsProps) {
  const view = getChatRoomSessionView(session, roomId);
  const canDraft = view.canDraft && realtimeReady;
  const composer = useChatMessageComposer({
    enabled: canDraft,
    roomId,
  });
  const isUnavailable = !canDraft || composer.isSending;

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

      {composer.errorMessage ? (
        <div className="border-t border-red-200 bg-red-50 px-5 py-3 text-red-950" role="alert">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">{composer.errorMessage}</p>
            {composer.canRetry ? (
              <button className="secondary-button" onClick={composer.retry} type="button">
                같은 메시지 다시 전송
              </button>
            ) : null}
          </div>
        </div>
      ) : composer.sent ? (
        <div
          aria-live="polite"
          className="border-t border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-950"
          role="status"
        >
          서버가 메시지를 접수했습니다.
        </div>
      ) : null}

      <form
        className="flex gap-3 border-t border-slate-200 bg-white p-4"
        data-delivery-status={composer.deliveryStatus ?? "idle"}
        onSubmit={(event) => {
          event.preventDefault();
          composer.send();
        }}
      >
        <label className="sr-only" htmlFor={`chat-message-${roomId}`}>
          메시지
        </label>
        <input
          className={`min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 ${
            isUnavailable
              ? "cursor-not-allowed bg-slate-100 text-slate-500"
              : "bg-white text-slate-950"
          }`}
          disabled={isUnavailable}
          id={`chat-message-${roomId}`}
          onChange={(event) => composer.setDraft(event.target.value)}
          placeholder={
            composer.isSending
              ? "메시지 전송 결과를 확인하고 있습니다."
              : canDraft
                ? "메시지를 입력해 주세요."
                : view.canDraft
                  ? "메시지 동기화가 끝나면 입력할 수 있습니다."
                  : "이 탭을 활성화하면 메시지를 입력할 수 있습니다."
          }
          value={composer.draft}
        />
        <button
          className={`primary-button ${composer.canSend ? "" : "cursor-not-allowed opacity-50"}`}
          disabled={!composer.canSend}
          type="submit"
        >
          {composer.isSending ? "전송 중" : "전송"}
        </button>
      </form>
    </>
  );
}
