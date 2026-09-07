"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ChatRoomEntryError,
  type ChatRoomEntryErrorViewModel,
} from "@/components/chat-room-entry-error";
import {
  ChatMessageViewport,
  type ChatMessageViewportViewModel,
} from "@/components/chat-message-viewport";
import type { ChatRoomHeaderViewModel } from "@/components/chat-room-view-model";
import { PlatformNavigationClient } from "@/components/platform-navigation-client";
import { PlatformHeader, PlatformShell } from "@/components/platform-shell";
import { useChatRoomVisualViewportHeight } from "@/components/use-chat-room-visual-viewport";

export type ChatMessageHistoryViewModel = Omit<ChatMessageViewportViewModel, "readStatePaused">;

export type ChatRoomViewProps = Readonly<{
  header: ChatRoomHeaderViewModel;
  headerAction: ReactNode;
  initializing: boolean;
  messageHistory: ChatMessageHistoryViewModel;
  messageSearchPanel: ReactNode;
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
  initializing,
  messageHistory,
  messageSearchPanel,
  overlay,
  roomError,
  sessionIndicator,
  sessionNotice,
  sessionControls,
  syncStatus,
}: ChatRoomViewProps) {
  const chatRoomShellRef = useChatRoomVisualViewportHeight<HTMLDivElement>(0);
  const hasOverlay =
    !initializing &&
    roomError === null &&
    overlay !== null &&
    overlay !== undefined &&
    overlay !== false;

  return (
    <PlatformShell
      bottomNavigation={<PlatformNavigationClient />}
      className="chat-publishing-surface text-[var(--chat-publishing-color-text)]"
      contentInert={hasOverlay}
      header={
        <PlatformHeader
          actions={roomError || initializing ? undefined : headerAction}
          backAction={{ ariaLabel: "채팅방 목록으로 돌아가기", href: "/chat" }}
          title={header.title}
        />
      }
      headerSize="compact"
      overlay={roomError || initializing ? null : overlay}
      scroll="child"
      shellRef={chatRoomShellRef}
    >
      <section className="flex h-full min-h-0 flex-col overflow-hidden" data-chat-room-view="true">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {initializing ? (
            <ChatRoomInitialLoading />
          ) : roomError ? (
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

              {messageSearchPanel}

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

const INITIAL_LOADING_MESSAGE_DELAY_MS = 450;

function ChatRoomInitialLoading() {
  const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setShowMessage(true), INITIAL_LOADING_MESSAGE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <div
      aria-busy="true"
      className="flex min-h-0 flex-1 flex-col bg-white"
      data-chat-room-entry-state="initializing"
    >
      <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col justify-center gap-4 px-5">
        <span className="h-12 w-3/5 rounded-[var(--chat-publishing-radius-card)] bg-[var(--chat-publishing-color-neutral-soft)]" />
        <span className="ml-auto h-16 w-2/3 rounded-[var(--chat-publishing-radius-card)] bg-[var(--chat-publishing-color-accent-soft)]" />
        <span className="h-14 w-1/2 rounded-[var(--chat-publishing-radius-card)] bg-[var(--chat-publishing-color-neutral-soft)]" />
      </div>
      <p
        aria-live="polite"
        className={`min-h-5 px-5 text-center text-sm font-medium leading-5 text-[var(--chat-publishing-color-muted)] ${
          showMessage ? "opacity-100" : "opacity-0"
        }`}
        role="status"
      >
        채팅방을 준비하고 있어요.
      </p>
      <div
        aria-hidden="true"
        className="m-4 mt-2 flex h-[98px] items-end gap-2 rounded-[var(--chat-publishing-radius-card)] border border-[var(--chat-publishing-color-border)] bg-white p-3"
      >
        <span className="h-[72px] min-w-0 flex-1 rounded-[var(--chat-publishing-radius-control)] bg-[var(--chat-publishing-color-neutral-soft)]" />
        <span className="h-12 w-16 shrink-0 rounded-[var(--chat-publishing-radius-control)] bg-[var(--chat-publishing-color-neutral-soft)]" />
      </div>
    </div>
  );
}
