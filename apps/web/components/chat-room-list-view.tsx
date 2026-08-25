"use client";

import Link from "next/link";
import { type ReactNode, type Ref } from "react";
import { ChatConnectionStatus } from "@/components/chat-connection-status";
import { ChatRoomCategoryBadges } from "@/components/chat-room-category-badges";
import {
  CHAT_ROOM_PUBLISHING_COPY,
  getChatRoomMemberCountPresentation,
} from "@/components/chat-room-publishing";
import { CREATE_CHAT_ROOM_FORM_ID, CreateChatRoomForm } from "@/components/create-chat-room-form";
import { getChatRoomUnreadBadgePresentation } from "@/components/chat-room-unread-badge";
import { JoinChatRoomControl } from "@/components/join-chat-room-control";
import { PublicRoomSearchForm } from "@/components/public-room-search-form";
import type { PublicRoomSearchController } from "@/components/use-public-room-search";
import type { PublicRoomListItem, RoomInboxListItem } from "@/lib/chat/chat-room-contracts";
import { getPublicRoomListErrorMessage } from "@/lib/chat/chat-room-list-error-presentation";

const SCROLLABLE_ROOM_LIST_CLASS_NAME =
  "grid max-h-[60dvh] scroll-p-1 gap-3 overflow-y-auto overscroll-contain pr-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)] sm:max-h-[32rem] [scrollbar-gutter:stable]";

type RoomListState<TItem> = Readonly<{
  error: unknown;
  hasNextPage: boolean;
  isError: boolean;
  isFetchingNextPage: boolean;
  isPending: boolean;
  loadMore: () => void;
  retry: () => void;
  rooms: readonly TItem[];
}>;

type ChatRoomListViewProps = Readonly<{
  closeCreateRoomForm: () => void;
  createRoomTriggerRef: Ref<HTMLButtonElement>;
  isCreateRoomOpen: boolean;
  participatingRooms: RoomListState<RoomInboxListItem>;
  publicRoomSearch: PublicRoomSearchController;
  publicRooms: RoomListState<PublicRoomListItem>;
  toggleCreateRoomForm: () => void;
}>;

export function ChatRoomListView({
  closeCreateRoomForm,
  createRoomTriggerRef,
  isCreateRoomOpen,
  participatingRooms,
  publicRoomSearch,
  publicRooms,
  toggleCreateRoomForm,
}: ChatRoomListViewProps) {
  return (
    <div className="chat-room-list chat-publishing-surface mx-auto min-h-dvh w-full max-w-[393px] overflow-hidden bg-white text-[var(--chat-publishing-color-text)] shadow-[var(--chat-publishing-shadow-card)]">
      <header className="flex h-16 items-center border-b border-[var(--chat-publishing-color-border)] px-4">
        <h1 className="text-xl font-bold tracking-[-0.025em]">토론방</h1>
      </header>

      <div className="grid gap-6 px-4 py-4">
        <section aria-label="채팅방 검색과 생성" className="grid gap-3">
          <PublicRoomSearchForm controller={publicRoomSearch} />
          <button
            aria-controls={CREATE_CHAT_ROOM_FORM_ID}
            aria-expanded={isCreateRoomOpen}
            className="ml-auto inline-flex h-12 items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-primary)] bg-[var(--chat-publishing-color-accent-soft)] px-4 text-base font-bold text-[var(--chat-publishing-color-primary-emphasis)] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={toggleCreateRoomForm}
            ref={createRoomTriggerRef}
            type="button"
          >
            {isCreateRoomOpen ? "작성 닫기" : CHAT_ROOM_PUBLISHING_COPY.createRoom}
          </button>
        </section>

        {isCreateRoomOpen ? (
          <div className="rounded-[var(--chat-publishing-radius-card)] border border-[var(--chat-publishing-color-border)] p-4">
            <CreateChatRoomForm onCancel={closeCreateRoomForm} />
          </div>
        ) : null}

        <ChatConnectionStatus />

        <RoomListSection title="참여한 방">
          <QueryFailure
            error={participatingRooms.error}
            onRetry={participatingRooms.retry}
            title="참여 중인 방을 불러오지 못했습니다."
            visible={participatingRooms.isError}
          />

          {participatingRooms.isPending && participatingRooms.rooms.length === 0 ? (
            <RoomListNotice message="참여 중인 방을 불러오고 있습니다." />
          ) : participatingRooms.rooms.length === 0 &&
            !participatingRooms.isError &&
            participatingRooms.hasNextPage ? (
            <RoomListNotice message="현재 페이지에 표시할 방이 없습니다. 다음 페이지를 확인해 주세요." />
          ) : participatingRooms.rooms.length === 0 && !participatingRooms.isError ? (
            <RoomListNotice message="현재 참여 중인 방이 없습니다." />
          ) : participatingRooms.rooms.length > 0 ? (
            <ul
              aria-label="참여 중인 채팅방"
              className={SCROLLABLE_ROOM_LIST_CLASS_NAME}
              tabIndex={0}
            >
              {participatingRooms.rooms.map((room) => (
                <li key={room.roomId}>
                  <MyRoomCard room={room} />
                </li>
              ))}
            </ul>
          ) : null}

          <LoadMoreButton
            hasNextPage={participatingRooms.hasNextPage}
            isFetching={participatingRooms.isFetchingNextPage}
            label="참여 중인 방 더 보기"
            onClick={participatingRooms.loadMore}
          />
        </RoomListSection>

        <RoomListSection separated title="참여 가능한 방">
          <QueryFailure
            error={publicRooms.error}
            errorMessage={getPublicRoomListErrorMessage(publicRooms.error)}
            onRetry={publicRooms.retry}
            title="공개 방을 불러오지 못했습니다."
            visible={publicRooms.isError}
          />

          {publicRooms.isPending && publicRooms.rooms.length === 0 ? (
            <RoomListNotice message="공개 방을 불러오고 있습니다." />
          ) : publicRooms.rooms.length === 0 && !publicRooms.isError ? (
            <RoomListNotice message={CHAT_ROOM_PUBLISHING_COPY.noAvailableRooms} />
          ) : publicRooms.rooms.length > 0 ? (
            <ul aria-label="공개 채팅방" className={SCROLLABLE_ROOM_LIST_CLASS_NAME} tabIndex={0}>
              {publicRooms.rooms.map((room) => (
                <li key={room.roomId}>
                  <PublicRoomCard room={room} />
                </li>
              ))}
            </ul>
          ) : null}

          <LoadMoreButton
            hasNextPage={publicRooms.hasNextPage}
            isFetching={publicRooms.isFetchingNextPage}
            label="공개 방 더 보기"
            onClick={publicRooms.loadMore}
          />
        </RoomListSection>
      </div>
    </div>
  );
}

type RoomListSectionProps = Readonly<{
  children: ReactNode;
  separated?: boolean;
  title: string;
}>;

function RoomListSection({ children, separated = false, title }: RoomListSectionProps) {
  return (
    <section
      className={
        separated
          ? "grid gap-3 border-t border-[var(--chat-publishing-color-muted)] pt-5"
          : "grid gap-3"
      }
    >
      <h2 className="text-lg font-bold leading-7 tracking-[-0.02em]">{title}</h2>
      {children}
    </section>
  );
}

export function MyRoomCard({ room }: { room: RoomInboxListItem }) {
  const memberCount = getChatRoomMemberCountPresentation(room.activeMemberCount);
  const unread = getChatRoomUnreadBadgePresentation(room.unreadCount, room.unreadCountCapped);

  return (
    <Link
      className="group grid min-h-[120px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--chat-publishing-radius-card)] border border-[var(--chat-publishing-color-border)] bg-white px-5 py-4 transition hover:border-[var(--chat-publishing-color-primary)] hover:bg-[var(--chat-publishing-color-accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
      href={`/chat/${room.roomId}`}
    >
      <span className="min-w-0 flex-1">
        <ChatRoomCategoryBadges categories={room.categories} />
        <strong className="mt-1.5 block truncate text-[17px] font-bold leading-6 text-[var(--chat-publishing-color-text)]">
          {room.name}
        </strong>
        <span
          aria-label={
            unread ? `${memberCount.ariaLabel}, ${unread.ariaLabel}` : memberCount.ariaLabel
          }
          className="mt-0.5 block truncate text-sm leading-5 text-[var(--chat-publishing-color-muted)]"
        >
          {memberCount.text}
          {unread ? ` · 읽지 않음 ${unread.text}` : null}
        </span>
      </span>
      <span className="inline-flex h-12 min-w-[108px] shrink-0 items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-primary)] bg-white px-4 text-base font-bold text-[var(--chat-publishing-color-primary-emphasis)] transition group-hover:bg-[var(--chat-publishing-color-accent-soft)]">
        자세히 보기
      </span>
    </Link>
  );
}

export function PublicRoomCard({ room }: { room: PublicRoomListItem }) {
  return (
    <article className="grid min-h-[120px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--chat-publishing-radius-card)] border border-[var(--chat-publishing-color-border)] bg-white px-5 py-4">
      <RoomSummary room={room} />
      <JoinChatRoomControl room={room} />
    </article>
  );
}

function RoomSummary({ room }: { room: PublicRoomListItem }) {
  const memberCount = getChatRoomMemberCountPresentation(room.activeMemberCount);

  return (
    <span className="min-w-0 flex-1">
      <ChatRoomCategoryBadges categories={room.categories} />
      <strong className="mt-1.5 block truncate text-[17px] font-bold leading-6 text-[var(--chat-publishing-color-text)]">
        {room.name}
      </strong>
      <span
        aria-label={memberCount.ariaLabel}
        className="mt-0.5 block truncate text-sm leading-5 text-[var(--chat-publishing-color-muted)]"
      >
        {memberCount.text}
      </span>
    </span>
  );
}

function QueryFailure({
  error,
  errorMessage,
  onRetry,
  title,
  visible,
}: {
  error: unknown;
  errorMessage?: string;
  onRetry: () => void;
  title: string;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }

  return (
    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-950" role="alert">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs opacity-80">{errorMessage ?? toErrorMessage(error)}</p>
      <button className="secondary-button mt-3" onClick={onRetry} type="button">
        다시 불러오기
      </button>
    </div>
  );
}

function RoomListNotice({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

function LoadMoreButton({
  hasNextPage,
  isFetching,
  label,
  onClick,
}: {
  hasNextPage: boolean;
  isFetching: boolean;
  label: string;
  onClick: () => void;
}) {
  if (!hasNextPage) {
    return null;
  }

  return (
    <div className="mt-4 text-center">
      <button className="secondary-button" disabled={isFetching} onClick={onClick} type="button">
        {isFetching ? "불러오는 중…" : label}
      </button>
    </div>
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
