"use client";

import type { ReactNode } from "react";
import {
  ChatRoomEntryError,
  type ChatRoomEntryErrorViewModel,
} from "@/components/chat-room-entry-error";
import {
  ChatMessageViewport,
  type ChatMessageViewportViewModel,
} from "@/components/chat-message-viewport";
import type { ChatRoomHeaderViewModel } from "@/components/chat-room-view-model";
import { PlatformHeader, PlatformShell } from "@/components/platform-shell";
import { useChatRoomVisualViewportHeight } from "@/components/use-chat-room-visual-viewport";

export type ChatMessageHistoryViewModel = Omit<ChatMessageViewportViewModel, "readStatePaused">;

export type ChatRoomViewProps = Readonly<{
  header: ChatRoomHeaderViewModel;
  headerAction: ReactNode;
  messageHistory: ChatMessageHistoryViewModel;
  overlay: ReactNode;
  roomError: ChatRoomEntryErrorViewModel | null;
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
  const chatRoomShellRef = useChatRoomVisualViewportHeight<HTMLDivElement>(0);
  const hasOverlay =
    roomError === null && overlay !== null && overlay !== undefined && overlay !== false;

  return (
    <PlatformShell
      className="chat-publishing-surface text-[var(--chat-publishing-color-text)]"
      contentInert={hasOverlay}
      header={
        <PlatformHeader
          actions={roomError ? undefined : headerAction}
          backAction={{ ariaLabel: "채팅방 목록으로 돌아가기", href: "/chat" }}
          title={header.title}
        />
      }
      overlay={roomError ? null : overlay}
      scroll="child"
      shellRef={chatRoomShellRef}
    >
      <section className="flex h-full min-h-0 flex-col overflow-hidden" data-chat-room-view="true">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {roomError ? (
            <ChatRoomEntryError error={roomError} />
          ) : (
            <>
              <div className="shrink-0 bg-white">
                <div className="sr-only">
                  <span>{header.statusLabel}</span>
                  <span>{header.description}</span>
                  {sessionIndicator}
                </div>
                {sessionNotice}
                {syncStatus}
              </div>

              <ChatMessageViewport
                history={{
                  ...messageHistory,
                  readStatePaused: hasOverlay,
                }}
              />

              <div className="shrink-0 bg-white">{sessionControls}</div>
            </>
          )}
        </div>
      </section>
    </PlatformShell>
  );
}
