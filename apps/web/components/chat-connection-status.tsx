"use client";

import { useChatRealtimeConnection } from "@/components/chat-realtime-provider";
import { getChatConnectionPresentation } from "@/lib/chat/realtime/chat-connection-presentation";

const TONE_CLASS_NAMES = {
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  positive: "border-emerald-200 bg-emerald-50 text-emerald-800",
  negative: "border-red-200 bg-red-50 text-red-800",
} as const;

const DOT_CLASS_NAMES = {
  neutral: "bg-slate-400",
  pending: "bg-amber-500",
  positive: "bg-emerald-500",
  negative: "bg-red-500",
} as const;

export function ChatConnectionStatus() {
  const { status, error, reconnect } = useChatRealtimeConnection();
  const presentation = getChatConnectionPresentation(status);

  return (
    <div
      className={`flex w-fit max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-full border px-3 py-1.5 text-xs font-semibold ${TONE_CLASS_NAMES[presentation.tone]}`}
      role={presentation.tone === "negative" ? "alert" : "status"}
    >
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${DOT_CLASS_NAMES[presentation.tone]}`}
      />
      <span>실시간 연결: {presentation.label}</span>
      {presentation.canReconnect ? (
        <button className="underline underline-offset-2" onClick={reconnect} type="button">
          다시 연결
        </button>
      ) : null}
      {error ? <span className="basis-full font-normal">{error.message}</span> : null}
    </div>
  );
}
