import { PlatformNavigationClient } from "@/components/platform-navigation-client";
import { PlatformHeader, PlatformShell } from "@/components/platform-shell";

export function ChatRoomScreenLoading() {
  return (
    <PlatformShell
      bottomNavigation={<PlatformNavigationClient />}
      className="chat-publishing-surface text-[var(--chat-publishing-color-text)]"
      header={
        <PlatformHeader
          backAction={{ ariaLabel: "채팅방 목록으로 돌아가기", href: "/chat" }}
          title="채팅방"
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
        <span className="sr-only">채팅방을 준비하고 있어요.</span>
        <span
          aria-hidden="true"
          className="size-8 rounded-full border-[3px] border-[var(--chat-publishing-color-accent-soft)] border-t-[var(--chat-publishing-color-primary)] motion-safe:animate-spin"
        />
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
