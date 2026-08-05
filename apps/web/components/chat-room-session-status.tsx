import type { ChatRoomSessionView } from "@/lib/chat/realtime/chat-room-session-view";

type ChatRoomSessionIndicatorProps = Readonly<{
  view: ChatRoomSessionView;
}>;

type ChatRoomSessionNoticeProps = Readonly<{
  onReactivate: () => void;
  onReconnect: () => void;
  view: ChatRoomSessionView;
}>;

const indicatorToneClasses = {
  negative: "bg-red-50 text-red-700 ring-red-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  positive: "bg-emerald-50 text-emerald-700 ring-emerald-200",
} as const;

const indicatorDotClasses = {
  negative: "bg-red-500",
  pending: "bg-amber-500",
  positive: "bg-emerald-500",
} as const;

export function ChatRoomSessionIndicator({ view }: ChatRoomSessionIndicatorProps) {
  return (
    <span
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${indicatorToneClasses[view.indicatorTone]}`}
      role="status"
    >
      <span
        aria-hidden="true"
        className={`size-1.5 shrink-0 rounded-full ${indicatorDotClasses[view.indicatorTone]}`}
      />
      {view.indicatorLabel}
    </span>
  );
}

export function ChatRoomSessionNotice({
  onReactivate,
  onReconnect,
  view,
}: ChatRoomSessionNoticeProps) {
  if (!view.showNotice) {
    return null;
  }

  return (
    <div
      className={`mt-3 rounded-xl border px-3 py-2.5 ${
        view.kind === "replaced"
          ? "border-amber-200 bg-amber-50 text-amber-950"
          : "border-red-200 bg-red-50 text-red-950"
      }`}
      role="alert"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{view.title}</p>
          <p className="mt-0.5 text-xs opacity-75">{view.description}</p>
        </div>

        {view.canReactivate ? (
          <button
            className="shrink-0 rounded-lg border border-current px-3 py-1.5 text-xs font-semibold"
            onClick={onReactivate}
            type="button"
          >
            이 탭에서 다시 활성화
          </button>
        ) : view.canReconnect ? (
          <button
            className="shrink-0 rounded-lg border border-current px-3 py-1.5 text-xs font-semibold"
            onClick={onReconnect}
            type="button"
          >
            다시 연결
          </button>
        ) : null}
      </div>
    </div>
  );
}
