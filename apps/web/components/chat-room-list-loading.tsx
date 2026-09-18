import Image from "next/image";
import type { ReactNode } from "react";
import { CHAT_ROOM_PUBLISHING_COPY } from "@/components/chat-room-publishing";
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
        <ChatRoomListLoadingInboxControls />

        <ChatRoomLoadingSection title="참여한 방">
          <ChatRoomListSkeleton
            ariaLabel="참여 중인 토론방을 불러오는 중"
            keys={PARTICIPATING_ROOM_SKELETON_KEYS}
            listClassName={PARTICIPATING_ROOM_LIST_CLASS_NAME}
            message="참여 중인 방을 불러오고 있습니다."
          />
        </ChatRoomLoadingSection>

        <section className="grid gap-5 border-t border-[#8a949e] pt-5">
          <ChatRoomListLoadingSearch />

          <ChatRoomLoadingSection title="참여 가능한 방">
            <ChatRoomListSkeleton
              ariaLabel="참여 가능한 토론방을 불러오는 중"
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

function ChatRoomListLoadingInboxControls() {
  return (
    <div
      aria-label="참여한 방 필터와 토론방 생성 요청"
      className="flex items-center justify-between gap-3"
      data-chat-room-list-loading-controls="true"
    >
      <div aria-label="참여한 방 필터" className="flex items-center gap-1.5" role="group">
        <button
          aria-pressed="true"
          className="inline-flex h-11 items-center justify-center rounded-[var(--chat-publishing-radius-pill)] border border-[var(--chat-publishing-color-primary)] bg-[var(--chat-publishing-color-accent-soft)] px-3 text-sm font-bold text-[var(--chat-publishing-color-primary-emphasis)] disabled:cursor-not-allowed"
          disabled
          type="button"
        >
          전체
        </button>
        <button
          aria-pressed="false"
          className="inline-flex h-11 items-center justify-center rounded-[var(--chat-publishing-radius-pill)] border border-[#8a949e] bg-white px-3 text-sm font-medium text-[#1f2124] disabled:cursor-not-allowed"
          disabled
          type="button"
        >
          안읽음
        </button>
      </div>
      <button
        className="inline-flex h-12 items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-primary)] bg-[var(--chat-publishing-color-accent-soft)] px-4 text-base font-bold leading-5 text-[var(--chat-publishing-color-primary-emphasis)] disabled:cursor-not-allowed"
        disabled
        type="button"
      >
        {CHAT_ROOM_PUBLISHING_COPY.createRoom}
      </button>
    </div>
  );
}

function ChatRoomListLoadingSearch() {
  return (
    <form
      aria-label="공개 토론방 검색"
      className="grid gap-3"
      data-chat-room-list-loading-search="true"
      role="search"
    >
      <label className="grid min-w-0 gap-1.5 text-sm text-[var(--chat-publishing-color-text)]">
        <span className="font-bold">토론방 이름 검색</span>
        <span className="flex h-12 min-w-0 items-center overflow-hidden rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-muted)] bg-white">
          <Image
            alt=""
            aria-hidden="true"
            className="ml-3 size-6 shrink-0"
            height={24}
            src="/assets/chat/search.png"
            width={24}
          />
          <input
            autoComplete="off"
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-[15px] text-[var(--chat-publishing-color-text)] outline-none placeholder:text-[#757575] disabled:cursor-not-allowed"
            disabled
            inputMode="search"
            placeholder="주제를 검색해 보세요"
            type="search"
          />
          <button
            className="h-[46px] shrink-0 bg-[var(--chat-publishing-color-primary)] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled
            type="submit"
          >
            검색
          </button>
        </span>
      </label>
    </form>
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
