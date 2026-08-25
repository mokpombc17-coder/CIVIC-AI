"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ChatMessageViewport,
  type ChatMessageViewportViewModel,
} from "@/components/chat-message-viewport";
import { ChatRoomOverlayHost } from "@/components/chat-room-overlay-host";
import type { ChatRoomHeaderViewModel } from "@/components/chat-room-view-model";
import { useChatRoomVisualViewportMaxHeight } from "@/components/use-chat-room-visual-viewport";

const CHAT_ROOM_BOTTOM_GAP = 16;

export type ChatMessageHistoryViewModel = Omit<ChatMessageViewportViewModel, "readStatePaused">;

export type ChatRoomViewProps = Readonly<{
  header: ChatRoomHeaderViewModel;
  headerAction: ReactNode;
  messageHistory: ChatMessageHistoryViewModel;
  overlay: ReactNode;
  roomError: Readonly<{
    message: string;
    onRetry: () => void;
  }> | null;
  sessionIndicator: ReactNode;
  sessionNotice: ReactNode;
  sessionControls: ReactNode;
  syncStatus: ReactNode;
}>;

export function ChatRoomView({
  header,
  headerAction,
  messageHistory,
  overlay,
  roomError,
  sessionIndicator,
  sessionNotice,
  sessionControls,
  syncStatus,
}: ChatRoomViewProps) {
  const chatRoomCardRef = useChatRoomVisualViewportMaxHeight(CHAT_ROOM_BOTTOM_GAP);
  const hasOverlay = overlay !== null && overlay !== undefined && overlay !== false;

  return (
    <div className="chat-publishing-surface mx-auto min-h-dvh w-full max-w-[393px] overflow-hidden bg-white text-[var(--chat-publishing-color-text)] shadow-[var(--chat-publishing-shadow-card)]">
      <section
        className="relative flex h-dvh max-h-[852px] min-h-0 flex-col overflow-hidden rounded-[var(--chat-publishing-radius-panel)] border border-[var(--chat-publishing-color-border)] bg-white"
        data-chat-room-view="true"
        ref={chatRoomCardRef}
      >
        <div
          aria-hidden={hasOverlay ? true : undefined}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          inert={hasOverlay}
        >
          <ChatRoomHeader
            action={headerAction}
            header={header}
            sessionIndicator={sessionIndicator}
            sessionNotice={sessionNotice}
            syncStatus={syncStatus}
          />

          {roomError ? <ChatRoomError error={roomError} /> : null}

          <ChatMessageViewport
            history={{
              ...messageHistory,
              readStatePaused: hasOverlay,
            }}
          />

          <div className="shrink-0 bg-white">{sessionControls}</div>
        </div>

        <ChatRoomOverlayHost>{overlay}</ChatRoomOverlayHost>
      </section>
    </div>
  );
}

function ChatRoomHeader({
  action,
  header,
  sessionIndicator,
  sessionNotice,
  syncStatus,
}: {
  action: ReactNode;
  header: ChatRoomHeaderViewModel;
  sessionIndicator: ReactNode;
  sessionNotice: ReactNode;
  syncStatus: ReactNode;
}) {
  return (
    <header className="shrink-0 border-b border-[var(--chat-publishing-color-border)] bg-white">
      <div className="flex h-[68px] items-center gap-3 px-4">
        <Link
          aria-label="채팅방 목록으로 돌아가기"
          className="flex size-11 shrink-0 items-center justify-center rounded-[var(--chat-publishing-radius-control)] transition hover:bg-[var(--chat-publishing-color-neutral-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
          href="/chat"
        >
          <Image alt="" aria-hidden="true" height={24} src="/assets/chat/back.png" width={24} />
        </Link>

        <h1 className="min-w-0 flex-1 truncate text-xl font-bold leading-7 tracking-[-0.025em]">
          {header.title}
        </h1>

        <div className="shrink-0">{action}</div>
        <div className="sr-only">
          <span>{header.statusLabel}</span>
          <span>{header.description}</span>
          {sessionIndicator}
        </div>
      </div>
      {sessionNotice}
      {syncStatus}
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
