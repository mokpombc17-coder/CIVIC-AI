import {
  CHAT_ROOM_INBOX_FILTER_OPTIONS,
  type ChatRoomInboxFilter,
  type ChatRoomInboxFilterController,
} from "@/components/chat/chat-room-inbox-filter";

const FILTER_LABELS: Readonly<Record<ChatRoomInboxFilter, string>> = {
  ALL: "전체",
  UNREAD: "안읽음",
};

export function ChatRoomInboxFilterControl({
  controller,
}: {
  controller: ChatRoomInboxFilterController;
}) {
  return (
    <div aria-label="참여한 방 필터" className="flex items-center gap-1.5" role="group">
      {CHAT_ROOM_INBOX_FILTER_OPTIONS.map((filter) => {
        const isSelected = controller.value === filter;

        return (
          <button
            aria-pressed={isSelected}
            className={
              isSelected
                ? "inline-flex h-11 cursor-pointer items-center justify-center rounded-[var(--chat-publishing-radius-pill)] border border-[var(--chat-publishing-color-primary)] bg-[var(--chat-publishing-color-accent-soft)] px-3 text-sm font-bold text-[var(--chat-publishing-color-primary-emphasis)]"
                : "inline-flex h-11 cursor-pointer items-center justify-center rounded-[var(--chat-publishing-radius-pill)] border border-[#8a949e] bg-white px-3 text-sm font-medium text-[#1f2124]"
            }
            key={filter}
            onClick={() => controller.select(filter)}
            type="button"
          >
            {FILTER_LABELS[filter]}
          </button>
        );
      })}
    </div>
  );
}
