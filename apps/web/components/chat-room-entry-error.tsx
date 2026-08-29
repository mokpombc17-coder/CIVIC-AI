import Link from "next/link";
import { CHAT_ERROR_CARD_ACTION_CLASS_NAME, ChatErrorCard } from "@/components/chat-error-card";
import type { ChatRoomEntryErrorPresentation } from "@/lib/chat/chat-room-entry-error-presentation";

export type ChatRoomEntryErrorViewModel = ChatRoomEntryErrorPresentation &
  Readonly<{
    onRetry: () => void;
  }>;

export function ChatRoomEntryError({ error }: { error: ChatRoomEntryErrorViewModel }) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-white px-4 py-4">
      <ChatErrorCard
        action={
          error.action === "return-to-list" ? (
            <Link className={CHAT_ERROR_CARD_ACTION_CLASS_NAME} href="/chat">
              채팅방 목록
            </Link>
          ) : (
            <button
              className={CHAT_ERROR_CARD_ACTION_CLASS_NAME}
              onClick={error.onRetry}
              type="button"
            >
              다시 시도
            </button>
          )
        }
        detail={error.detail}
        title={error.title}
      />
    </main>
  );
}
