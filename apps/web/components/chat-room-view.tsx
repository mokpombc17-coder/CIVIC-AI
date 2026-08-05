"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ChatMessageViewport,
  type ChatMessageViewportFeedback,
  type ChatMessageViewportViewModel,
} from "@/components/chat-message-viewport";
import { ChatRoomOverlayHost } from "@/components/chat-room-overlay-host";
import type { ChatRoomHeaderViewModel } from "@/components/chat-room-view-model";
import { useChatRoomVisualViewportMaxHeight } from "@/components/use-chat-room-visual-viewport";

const CHAT_ROOM_BOTTOM_GAP = 16;

export type ChatMessageHistoryFeedback = ChatMessageViewportFeedback;
export type ChatMessageHistoryViewModel = ChatMessageViewportViewModel;

export type ChatRoomViewProps = Readonly<{
  connectionStatus: ReactNode;
  header: ChatRoomHeaderViewModel;
  membershipPanel: ReactNode;
  messageHistory: ChatMessageHistoryViewModel;
  overlay: ReactNode;
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
  overlay,
  roomError,
  sessionControls,
  syncStatus,
}: ChatRoomViewProps) {
  const chatRoomCardRef = useChatRoomVisualViewportMaxHeight(CHAT_ROOM_BOTTOM_GAP);
  const hasOverlay = overlay !== null && overlay !== undefined && overlay !== false;

  return (
    <div className="page-stack">
      <section
        className="relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        ref={chatRoomCardRef}
      >
        <div
          aria-hidden={hasOverlay ? true : undefined}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          inert={hasOverlay}
        >
          <ChatRoomHeader connectionStatus={connectionStatus} header={header} />

          {roomError ? <ChatRoomError error={roomError} /> : null}

          <ChatMessageViewport history={messageHistory} />

          <div className="shrink-0">
            {syncStatus}
            {sessionControls}
          </div>
        </div>

        <ChatRoomOverlayHost>{overlay}</ChatRoomOverlayHost>
      </section>

      {membershipPanel ? (
        <div aria-hidden={hasOverlay ? true : undefined} inert={hasOverlay}>
          {membershipPanel}
        </div>
      ) : null}
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
    <header className="flex shrink-0 items-center gap-4 border-b border-slate-200 px-5 py-4">
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
    <div className="shrink-0 border-b border-red-200 bg-red-50 px-5 py-4 text-red-950" role="alert">
      <p className="text-sm font-semibold">채팅방 정보를 불러오지 못했습니다.</p>
      <p className="mt-1 text-xs opacity-80">{error.message}</p>
      <button className="secondary-button mt-3" onClick={error.onRetry} type="button">
        방 정보 다시 불러오기
      </button>
    </div>
  );
}
