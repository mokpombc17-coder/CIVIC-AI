import type { ReactNode } from "react";
import { PlatformNavigationClient } from "@/components/platform-navigation-client";
import { PlatformHeader, PlatformShell } from "@/components/platform-shell";

const SCROLLABLE_ROOM_LIST_CLASS_NAME =
  "grid scroll-p-1 gap-3 overflow-y-auto overscroll-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]";

export const PARTICIPATING_ROOM_LIST_CLASS_NAME = `${SCROLLABLE_ROOM_LIST_CLASS_NAME} max-h-[252px]`;
export const PUBLIC_ROOM_LIST_CLASS_NAME = `${SCROLLABLE_ROOM_LIST_CLASS_NAME} max-h-[384px]`;
export const PARTICIPATING_ROOM_SKELETON_KEYS = [
  "participating-first",
  "participating-second",
] as const;
export const PUBLIC_ROOM_SKELETON_KEYS = ["public-first", "public-second", "public-third"] as const;

export function ChatRoomListLoading() {
  return (
    <PlatformShell
      bottomNavigation={<PlatformNavigationClient />}
      className="chat-publishing-surface text-[var(--chat-publishing-color-text)]"
      contentClassName="chat-room-list"
      header={<PlatformHeader backAction={{ ariaLabel: "홈으로", href: "/home" }} title="토론방" />}
      headerSize="compact"
    >
      <div className="grid gap-5 px-4 pb-4 pt-5">
        <div aria-hidden="true" className="flex items-center justify-between gap-3">
          <span className="h-12 w-28 animate-pulse rounded-[var(--chat-publishing-radius-control)] bg-[var(--chat-publishing-color-neutral-soft)]" />
          <span className="h-12 w-28 animate-pulse rounded-[var(--chat-publishing-radius-control)] bg-[var(--chat-publishing-color-neutral-soft)]" />
        </div>

        <ChatRoomLoadingSection title="참여한 방">
          <ChatRoomListSkeleton
            ariaLabel="참여 중인 채팅방을 불러오는 중"
            keys={PARTICIPATING_ROOM_SKELETON_KEYS}
            listClassName={PARTICIPATING_ROOM_LIST_CLASS_NAME}
            message="참여 중인 방을 불러오고 있습니다."
          />
        </ChatRoomLoadingSection>

        <section className="grid gap-5 border-t border-[#8a949e] pt-5">
          <div aria-hidden="true" className="grid gap-2">
            <span className="h-5 w-28 animate-pulse rounded-md bg-[var(--chat-publishing-color-neutral-soft)]" />
            <span className="h-12 w-full animate-pulse rounded-[var(--chat-publishing-radius-control)] bg-[var(--chat-publishing-color-neutral-soft)]" />
          </div>

          <ChatRoomLoadingSection title="참여 가능한 방">
            <ChatRoomListSkeleton
              ariaLabel="참여 가능한 채팅방을 불러오는 중"
              keys={PUBLIC_ROOM_SKELETON_KEYS}
              listClassName={PUBLIC_ROOM_LIST_CLASS_NAME}
              message="공개 방을 불러오고 있습니다."
            />
          </ChatRoomLoadingSection>
        </section>
      </div>
    </PlatformShell>
  );
}

export function ChatRoomListSkeleton({
  ariaLabel,
  keys,
  listClassName,
  message,
}: Readonly<{
  ariaLabel: string;
  keys: readonly string[];
  listClassName: string;
  message: string;
}>) {
  return (
    <div
      aria-busy="true"
      aria-label={ariaLabel}
      aria-live="polite"
      data-chat-room-list-state="loading"
      role="status"
    >
      <span className="sr-only">{message}</span>
      <ul aria-hidden="true" className={listClassName}>
        {keys.map((key) => (
          <li key={key}>
            <article
              className="grid h-[120px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--chat-publishing-radius-card)] border border-[var(--chat-publishing-color-border)] bg-white px-5 py-4 motion-safe:animate-pulse"
              data-chat-room-card-skeleton="true"
            >
              <span className="min-w-0">
                <span className="block h-5 w-14 rounded-full bg-[var(--chat-publishing-color-neutral-soft)]" />
                <span className="mt-2 block h-6 w-3/4 rounded-md bg-[var(--chat-publishing-color-neutral-soft)]" />
                <span className="mt-2 block h-5 w-1/2 rounded-md bg-[var(--chat-publishing-color-neutral-soft)]" />
              </span>
              <span className="h-12 min-w-[108px] rounded-[var(--chat-publishing-radius-control)] bg-[var(--chat-publishing-color-neutral-soft)]" />
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChatRoomLoadingSection({
  children,
  title,
}: Readonly<{ children: ReactNode; title: string }>) {
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-bold leading-[27px]">{title}</h2>
      {children}
    </section>
  );
}
