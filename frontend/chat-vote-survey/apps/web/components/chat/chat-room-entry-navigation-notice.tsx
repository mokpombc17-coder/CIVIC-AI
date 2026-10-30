export type ChatRoomEntryNavigationNoticeViewModel =
  | Readonly<{
      kind: "loading";
      message: string;
    }>
  | Readonly<{
      actionLabel: string;
      kind: "action";
      message: string;
      onAction: () => void;
    }>;

export function ChatRoomEntryNavigationNotice({
  notice,
}: {
  notice: ChatRoomEntryNavigationNoticeViewModel;
}) {
  return (
    <div
      aria-live="polite"
      className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b border-blue-100 bg-blue-50 px-5 py-2 text-xs text-blue-950"
      role="status"
    >
      <span>{notice.message}</span>
      {notice.kind === "action" ? (
        <button
          className="rounded-full border border-blue-200 bg-white px-3 py-1 font-semibold text-blue-800 transition hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          onClick={notice.onAction}
          type="button"
        >
          {notice.actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function createChatRoomEntryNavigationNotice(
  navigation: ChatRoomEntryNavigationController,
): ChatRoomEntryNavigationNoticeViewModel | null {
  if (navigation.status === "jumping") {
    return Object.freeze({
      kind: "loading",
      message: "마지막으로 읽은 위치를 찾고 있습니다…",
    });
  }

  if (navigation.recovery === "retry") {
    return Object.freeze({
      actionLabel: "읽은 위치 다시 찾기",
      kind: "action",
      message: "마지막으로 읽은 위치를 찾지 못했습니다.",
      onAction: navigation.retryReadPosition,
    });
  }

  return null;
}
import type { ChatRoomEntryNavigationController } from "@/components/chat/use-chat-room-entry-navigation";
