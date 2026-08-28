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

  const isInformational = view.kind === "replaced";

  return (
    <div
      className={`mx-4 mt-3 rounded-[var(--chat-publishing-radius-card)] border px-4 py-4 text-[var(--chat-publishing-color-text)] ${
        isInformational
          ? "border-[var(--chat-publishing-color-primary)] bg-[var(--chat-publishing-color-accent-soft)]"
          : "border-[#ffc95c] bg-[#fff7e8]"
      }`}
      data-chat-session-notice={view.kind}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-base font-bold ${
            isInformational
              ? "text-[var(--chat-publishing-color-primary-emphasis)]"
              : "text-[#8a5700]"
          }`}
        >
          {isInformational ? "i" : "!"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold leading-6">{view.title}</p>
          <p
            className={`mt-1 break-words text-sm leading-5 ${
              isInformational
                ? "text-[var(--chat-publishing-color-primary-emphasis)]"
                : "text-[#7a4b00]"
            }`}
          >
            {view.description}
          </p>
        </div>
      </div>
      {view.canReactivate ? (
        <button
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-primary)] bg-white px-4 text-sm font-bold text-[var(--chat-publishing-color-primary-emphasis)] transition hover:bg-[var(--chat-publishing-color-accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
          onClick={onReactivate}
          type="button"
        >
          이 탭에서 다시 활성화
        </button>
      ) : view.canReconnect ? (
        <button
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-primary)] bg-white px-4 text-sm font-bold text-[var(--chat-publishing-color-primary-emphasis)] transition hover:bg-[var(--chat-publishing-color-accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
          onClick={onReconnect}
          type="button"
        >
          다시 연결
        </button>
      ) : null}
    </div>
  );
}
