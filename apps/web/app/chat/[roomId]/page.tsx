import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatConnectionStatus } from "@/components/chat-connection-status";
import {
  PLACEHOLDER_CURRENT_USER_ID,
  findPlaceholderChatRoom,
  getPlaceholderChatMessages,
} from "../_fixtures/chat-placeholder-data";

type ChatRoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export async function generateMetadata({ params }: ChatRoomPageProps): Promise<Metadata> {
  const { roomId } = await params;
  const room = findPlaceholderChatRoom(roomId);

  return {
    title: room?.name ?? "채팅방",
  };
}

export default async function ChatRoomPage({ params }: ChatRoomPageProps) {
  const { roomId } = await params;
  const room = findPlaceholderChatRoom(roomId);

  if (!room) {
    notFound();
  }

  const messages = getPlaceholderChatMessages(room.id);

  return (
    <div className="page-stack">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center gap-4 border-b border-slate-200 px-5 py-4">
          <Link
            aria-label="채팅방 목록으로 돌아가기"
            className="flex size-10 items-center justify-center rounded-full border border-slate-200 text-xl text-slate-700 transition hover:bg-slate-100"
            href="/chat"
          >
            ←
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-bold text-slate-950">{room.name}</h1>
              <span className="status">임시 데이터</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">참여자 {room.memberCount}명</p>
            <p className="mt-1 truncate text-sm text-slate-500">{room.description}</p>
            <div className="mt-2">
              <ChatConnectionStatus />
            </div>
          </div>

          <button
            className="secondary-button cursor-not-allowed opacity-50"
            disabled
            title="방 상세 API 연결 후 활성화됩니다."
            type="button"
          >
            방 정보
          </button>
        </header>

        <div
          aria-label={`${room.name} 메시지`}
          aria-live="polite"
          aria-relevant="additions text"
          className="min-h-[28rem] space-y-5 bg-slate-50 px-5 py-6"
          role="log"
        >
          <div className="text-center">
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs text-slate-600">오늘</span>
          </div>

          <ol className="space-y-5">
            {messages.map((message) => {
              const isMine = message.senderUserId === PLACEHOLDER_CURRENT_USER_ID;

              return (
                <li className={`flex ${isMine ? "justify-end" : "justify-start"}`} key={message.id}>
                  <div
                    className={`max-w-[78%] ${isMine ? "items-end" : "items-start"} flex flex-col`}
                  >
                    {!isMine ? (
                      <span className="mb-1 px-1 text-xs font-semibold text-slate-600">
                        {message.senderName}
                      </span>
                    ) : null}
                    <div className="flex items-end gap-2">
                      {isMine ? (
                        <span className="text-[0.7rem] text-slate-400">{message.sentAt}</span>
                      ) : null}
                      <p
                        className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                          isMine
                            ? "rounded-br-md bg-blue-700 text-white"
                            : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                        }`}
                      >
                        {message.content}
                      </p>
                      {!isMine ? (
                        <span className="text-[0.7rem] text-slate-400">{message.sentAt}</span>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex gap-3 border-t border-slate-200 bg-white p-4">
          <label className="sr-only" htmlFor="chat-message">
            메시지
          </label>
          <input
            className="min-w-0 flex-1 cursor-not-allowed rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-slate-500"
            disabled
            id="chat-message"
            placeholder="WebSocket 연결 후 메시지를 입력할 수 있습니다."
          />
          <button className="primary-button cursor-not-allowed opacity-50" disabled type="button">
            전송
          </button>
        </div>
      </section>
    </div>
  );
}
