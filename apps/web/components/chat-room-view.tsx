import Link from "next/link";
import type { ReactNode } from "react";
import { ChatMessageList } from "@/components/chat-message-list";
import type {
  ChatMessageItemViewModel,
  ChatRoomHeaderViewModel,
} from "@/components/chat-room-view-model";

export type ChatMessageHistoryFeedback =
  | Readonly<{
      kind: "notice";
      message: string;
    }>
  | Readonly<{
      kind: "error";
      message: string;
      title: string;
    }>;

export type ChatMessageHistoryViewModel = Readonly<{
  canLoadOlder: boolean;
  feedback: ChatMessageHistoryFeedback | null;
  isLoadingOlder: boolean;
  items: readonly ChatMessageItemViewModel[];
  onLoadOlder: () => void;
  onRetry: () => void;
  roomLabel: string;
}>;

export type ChatRoomViewProps = Readonly<{
  connectionStatus: ReactNode;
  header: ChatRoomHeaderViewModel;
  membershipPanel: ReactNode;
  messageHistory: ChatMessageHistoryViewModel;
  roomError: Readonly<{
    message: string;
    onRetry: () => void;
  }> | null;
  sessionControls: ReactNode;
  syncStatus: ReactNode;
}>;

export function ChatRoomView({
  connectionStatus,
  header,
  membershipPanel,
  messageHistory,
  roomError,
  sessionControls,
  syncStatus,
}: ChatRoomViewProps) {
  return (
    <div className="page-stack">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <ChatRoomHeader connectionStatus={connectionStatus} header={header} />

        {roomError ? <ChatRoomError error={roomError} /> : null}

        <ChatMessageHistory history={messageHistory} />

        {syncStatus}
        {sessionControls}
      </section>

      {membershipPanel}
    </div>
  );
}

function ChatRoomHeader({
  connectionStatus,
  header,
}: {
  connectionStatus: ReactNode;
  header: ChatRoomHeaderViewModel;
}) {
  return (
    <header className="flex items-center gap-4 border-b border-slate-200 px-5 py-4">
      <Link
        aria-label="채팅방 목록으로 돌아가기"
        className="flex size-10 items-center justify-center rounded-full border border-slate-200 text-xl text-slate-700 transition hover:bg-slate-100"
        href="/chat"
      >
        ←
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-xl font-bold text-slate-950">{header.title}</h1>
          <span className="status">{header.statusLabel}</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">{header.description}</p>
        <div className="mt-2">{connectionStatus}</div>
      </div>
    </header>
  );
}

function ChatRoomError({ error }: { error: NonNullable<ChatRoomViewProps["roomError"]> }) {
  return (
    <div className="border-b border-red-200 bg-red-50 px-5 py-4 text-red-950" role="alert">
      <p className="text-sm font-semibold">채팅방 정보를 불러오지 못했습니다.</p>
      <p className="mt-1 text-xs opacity-80">{error.message}</p>
      <button className="secondary-button mt-3" onClick={error.onRetry} type="button">
        방 정보 다시 불러오기
      </button>
    </div>
  );
}

function ChatMessageHistory({ history }: { history: ChatRoomViewProps["messageHistory"] }) {
  return (
    <div
      aria-label={history.roomLabel}
      aria-live="polite"
      aria-relevant="additions text"
      className="min-h-[28rem] space-y-5 bg-slate-50 px-5 py-6"
      role="log"
    >
      {history.canLoadOlder ? (
        <div className="text-center">
          <button
            className="secondary-button"
            disabled={history.isLoadingOlder}
            onClick={history.onLoadOlder}
            type="button"
          >
            {history.isLoadingOlder ? "이전 메시지 불러오는 중…" : "이전 메시지 불러오기"}
          </button>
        </div>
      ) : null}

      {history.feedback?.kind === "notice" ? (
        <MessageHistoryNotice message={history.feedback.message} />
      ) : history.feedback?.kind === "error" ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-950" role="alert">
          <p className="text-sm font-semibold">{history.feedback.title}</p>
          <p className="mt-1 text-xs opacity-80">{history.feedback.message}</p>
          <button className="secondary-button mt-3" onClick={history.onRetry} type="button">
            다시 불러오기
          </button>
        </div>
      ) : null}

      {history.items.length > 0 ? <ChatMessageList items={history.items} /> : null}
    </div>
  );
}

function MessageHistoryNotice({ message }: { message: string }) {
  return (
    <div className="flex min-h-[20rem] items-center justify-center">
      <p className="text-center text-sm text-slate-500">{message}</p>
    </div>
  );
}
