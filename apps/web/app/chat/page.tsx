import type { Metadata } from "next";
import Link from "next/link";
import { ChatConnectionStatus } from "@/components/chat-connection-status";
import { PLACEHOLDER_CHAT_ROOMS } from "./_fixtures/chat-placeholder-data";

export const metadata: Metadata = {
  title: "채팅방",
};

export default function ChatPage() {
  return (
    <div className="page-stack">
      <section className="hero hero-compact">
        <p className="eyebrow">Chat rooms</p>
        <h1>채팅방</h1>
        <p>
          API 명세 연결 전 화면 흐름을 확인하기 위한 임시 목록입니다. 현재 표시되는 내용은 서버
          데이터가 아닙니다.
        </p>
        <ChatConnectionStatus />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Temporary data</p>
            <h2>참여 중인 방</h2>
          </div>
          <button
            className="primary-button cursor-not-allowed opacity-50"
            disabled
            title="방 생성 API 연결 후 활성화됩니다."
            type="button"
          >
            새 채팅방
          </button>
        </div>

        <ul className="grid gap-3">
          {PLACEHOLDER_CHAT_ROOMS.map((room) => (
            <li key={room.id}>
              <Link
                className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:bg-blue-50"
                href={`/chat/${room.id}`}
              >
                <span
                  aria-hidden="true"
                  className="flex size-12 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700"
                >
                  {room.name.slice(0, 1)}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-3">
                    <strong className="truncate text-slate-950">{room.name}</strong>
                    <span className="shrink-0 text-xs text-slate-500">{room.lastActivity}</span>
                  </span>
                  <span className="mt-1 flex items-center justify-between gap-3">
                    <span className="truncate text-sm text-slate-600">{room.lastMessage}</span>
                    {room.unreadCount > 0 ? (
                      <span
                        aria-label={`읽지 않은 메시지 ${room.unreadCount}개`}
                        className="flex min-w-6 shrink-0 items-center justify-center rounded-full bg-blue-700 px-2 py-0.5 text-xs font-bold text-white"
                      >
                        {room.unreadCount}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-2 block text-xs text-slate-500">
                    참여자 {room.memberCount}명
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
