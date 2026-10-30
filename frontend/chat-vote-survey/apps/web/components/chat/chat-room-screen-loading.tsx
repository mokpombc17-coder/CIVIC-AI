import { ChatRoomLoadingSpinner } from "@/components/chat/chat-room-loading-spinner";
import { PlatformNavigationClient } from "@/components/platform-navigation-client";
import { PlatformHeader, PlatformShell } from "@/components/platform-shell";

export function ChatRoomScreenLoading() {
  return (
    <PlatformShell
      bottomNavigation={<PlatformNavigationClient />}
      className="chat-publishing-surface text-[var(--chat-publishing-color-text)]"
      header={
        <PlatformHeader
          backAction={{ ariaLabel: "토론방 목록으로 돌아가기", href: "/chat" }}
          title="토론방"
        />
      }
      headerSize="compact"
      scroll="child"
    >
      <ChatRoomScreenLoadingContent />
    </PlatformShell>
  );
}

export function ChatRoomScreenLoadingContent() {
  return (
    <section
      aria-busy="true"
      className="flex h-full min-h-0 flex-col overflow-hidden bg-white"
      data-chat-room-entry-state="initializing"
      data-chat-room-screen-loading="true"
    >
      <div className="flex min-h-0 flex-1 items-center justify-center" role="status">
        <span className="sr-only">토론방을 준비하고 있어요.</span>
        <ChatRoomLoadingSpinner />
      </div>
      <div
        aria-hidden="true"
        className="m-4 mt-2 flex h-[98px] items-end gap-2 rounded-[var(--chat-publishing-radius-card)] border border-[var(--chat-publishing-color-border)] bg-white p-3"
        data-chat-room-composer-skeleton="true"
      >
        <span className="h-[72px] min-w-0 flex-1 rounded-[var(--chat-publishing-radius-control)] bg-[var(--chat-publishing-color-neutral-soft)]" />
        <span className="h-12 w-16 shrink-0 rounded-[var(--chat-publishing-radius-control)] bg-[var(--chat-publishing-color-neutral-soft)]" />
      </div>
    </section>
  );
}
