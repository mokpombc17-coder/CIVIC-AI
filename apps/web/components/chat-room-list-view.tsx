"use client";

import Link from "next/link";
import { ChatRoomCategoryBadges } from "@/components/chat-room-category-badges";
import { type ReactNode, type Ref } from "react";
import { ChatRoomInboxFilterControl } from "@/components/chat-room-inbox-filter-control";
import type { ChatRoomInboxFilterController } from "@/components/chat-room-inbox-filter";
import {
  getChatRoomListDetailTriggerId,
  type ChatRoomListDetailController,
} from "@/components/chat-room-list-detail";
import {
  CHAT_ROOM_LIST_DETAIL_DIALOG_ID,
  ChatRoomListDetailDialog,
} from "@/components/chat-room-list-detail-dialog";
import {
  CHAT_ROOM_PUBLISHING_COPY,
  getChatRoomMemberCountPresentation,
} from "@/components/chat-room-publishing";
import { CREATE_CHAT_ROOM_FORM_ID, CreateChatRoomForm } from "@/components/create-chat-room-form";
import { getChatRoomUnreadBadgePresentation } from "@/components/chat-room-unread-badge";
import { PublicRoomSearchForm } from "@/components/public-room-search-form";
import { PlatformHeader, PlatformShell } from "@/components/platform-shell";
import { PlatformNavigationClient } from "@/components/platform-navigation-client";
import type { PublicRoomSearchController } from "@/components/use-public-room-search";
import type { PublicRoomListItem, RoomInboxListItem } from "@/lib/chat/chat-room-contracts";
import {
  createCurrentChatLoginHref,
  isChatAuthenticationRequired,
} from "@/lib/chat/chat-authentication-required";
import { getPublicRoomListErrorMessage } from "@/lib/chat/chat-room-list-error-presentation";

const SCROLLABLE_ROOM_LIST_CLASS_NAME =
  "grid scroll-p-1 gap-3 overflow-y-auto overscroll-auto pr-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)] [scrollbar-gutter:stable]";
const PARTICIPATING_ROOM_LIST_CLASS_NAME = `${SCROLLABLE_ROOM_LIST_CLASS_NAME} max-h-[252px]`;
const PUBLIC_ROOM_LIST_CLASS_NAME = `${SCROLLABLE_ROOM_LIST_CLASS_NAME} max-h-[384px]`;
const PARTICIPATING_ROOM_SKELETON_KEYS = ["participating-first", "participating-second"] as const;
const PUBLIC_ROOM_SKELETON_KEYS = ["public-first", "public-second", "public-third"] as const;

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
  participatingRoomFilter: ChatRoomInboxFilterController;
  participatingRooms: RoomListState<RoomInboxListItem>;
  publicRoomSearch: PublicRoomSearchController;
  publicRooms: RoomListState<PublicRoomListItem>;
  roomDetail: ChatRoomListDetailController;
  toggleCreateRoomForm: () => void;
}>;

export function ChatRoomListView({
  closeCreateRoomForm,
  createRoomTriggerRef,
  isCreateRoomOpen,
  participatingRoomFilter,
  participatingRooms,
  publicRoomSearch,
  publicRooms,
  roomDetail,
  toggleCreateRoomForm,
}: ChatRoomListViewProps) {
  const isOverlayOpen = isCreateRoomOpen || roomDetail.selection !== null;
  const hasAppliedPublicRoomSearch = Boolean(publicRoomSearch.appliedQuery);
  const overlay = isCreateRoomOpen ? (
    <CreateChatRoomForm onCancel={closeCreateRoomForm} />
  ) : roomDetail.selection ? (
    <ChatRoomListDetailDialog onClose={roomDetail.close} selection={roomDetail.selection} />
  ) : undefined;

  return (
    <PlatformShell
      bottomNavigation={<PlatformNavigationClient />}
      className="chat-publishing-surface text-[var(--chat-publishing-color-text)]"
      contentInert={isOverlayOpen}
      contentClassName="chat-room-list"
      header={<PlatformHeader backAction={{ ariaLabel: "홈으로", href: "/home" }} title="토론방" />}
      headerSize="compact"
      overlay={overlay}
    >
      <div className="grid gap-5 px-4 pb-4 pt-5">
        <section
          aria-label="참여한 방 필터와 토론방 생성"
          className="flex items-center justify-between gap-3"
        >
          <ChatRoomInboxFilterControl controller={participatingRoomFilter} />
          <button
            aria-controls={CREATE_CHAT_ROOM_FORM_ID}
            aria-expanded={isCreateRoomOpen}
            className="inline-flex h-12 cursor-pointer items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-primary)] bg-[var(--chat-publishing-color-accent-soft)] px-4 text-base font-bold text-[var(--chat-publishing-color-primary-emphasis)] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={toggleCreateRoomForm}
            ref={createRoomTriggerRef}
            type="button"
          >
            {CHAT_ROOM_PUBLISHING_COPY.createRoom}
          </button>
        </section>

        <RoomListSection title="참여한 방">
          <QueryFailure
            error={participatingRooms.error}
            onRetry={participatingRooms.retry}
            title="참여 중인 방을 불러오지 못했습니다."
            visible={participatingRooms.isError}
          />

          {participatingRooms.isPending && participatingRooms.rooms.length === 0 ? (
            <RoomListSkeleton
              ariaLabel="참여 중인 채팅방을 불러오는 중"
              keys={PARTICIPATING_ROOM_SKELETON_KEYS}
              listClassName={PARTICIPATING_ROOM_LIST_CLASS_NAME}
              message="참여 중인 방을 불러오고 있습니다."
            />
          ) : participatingRoomFilter.value === "UNREAD" &&
            participatingRooms.rooms.length === 0 &&
            !participatingRooms.isError ? (
            <RoomListNotice
              description="읽지 않은 메시지가 없습니다."
              message="새 메시지를 모두 확인했어요"
              size="participating"
              variant="all-read"
            />
          ) : participatingRooms.rooms.length === 0 &&
            !participatingRooms.isError &&
            participatingRooms.hasNextPage ? (
            <RoomListNotice
              message="현재 페이지에 표시할 방이 없습니다. 다음 페이지를 확인해 주세요."
              size="participating"
            />
          ) : participatingRooms.rooms.length === 0 && !participatingRooms.isError ? (
            <RoomListNotice
              description="관심 있는 주제를 찾아 다른 사람들과 생각을 나눠보세요."
              message="아직 참여한 토론방이 없어요."
              size="participating"
              variant="no-participating-rooms"
            />
          ) : participatingRooms.rooms.length > 0 ? (
            <ul
              aria-label="참여 중인 채팅방"
              className={PARTICIPATING_ROOM_LIST_CLASS_NAME}
              tabIndex={0}
            >
              {participatingRooms.rooms.map((room) => (
                <li key={room.roomId}>
                  <MyRoomCard
                    isDetailOpen={roomDetail.selection?.room.roomId === room.roomId}
                    onOpenDetails={(trigger) =>
                      roomDetail.open({ kind: "participating", room }, trigger)
                    }
                    room={room}
                  />
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

        <section
          aria-label="참여 가능한 토론방 검색과 목록"
          className="grid gap-5 border-t border-[#8a949e] pt-5"
        >
          <PublicRoomSearchForm controller={publicRoomSearch} />

          <RoomListSection title="참여 가능한 방">
            <QueryFailure
              error={publicRooms.error}
              errorMessage={getPublicRoomListErrorMessage(publicRooms.error)}
              onRetry={publicRooms.retry}
              title="공개 방을 불러오지 못했습니다."
              visible={publicRooms.isError}
            />

            {publicRooms.isPending && publicRooms.rooms.length === 0 ? (
              <RoomListSkeleton
                ariaLabel="참여 가능한 채팅방을 불러오는 중"
                keys={PUBLIC_ROOM_SKELETON_KEYS}
                listClassName={PUBLIC_ROOM_LIST_CLASS_NAME}
                message="공개 방을 불러오고 있습니다."
              />
            ) : publicRooms.rooms.length === 0 && !publicRooms.isError ? (
              hasAppliedPublicRoomSearch ? (
                <RoomListNotice
                  message={CHAT_ROOM_PUBLISHING_COPY.noPublicRoomSearchResults}
                  size="public"
                />
              ) : (
                <RoomListNotice
                  description={CHAT_ROOM_PUBLISHING_COPY.noAvailableRoomsDescription}
                  message={CHAT_ROOM_PUBLISHING_COPY.noAvailableRooms}
                  size="public"
                  variant="no-available-rooms"
                />
              )
            ) : publicRooms.rooms.length > 0 ? (
              <ul aria-label="공개 채팅방" className={PUBLIC_ROOM_LIST_CLASS_NAME} tabIndex={0}>
                {publicRooms.rooms.map((room) => (
                  <li key={room.roomId}>
                    <PublicRoomCard
                      isDetailOpen={roomDetail.selection?.room.roomId === room.roomId}
                      onOpenDetails={(trigger) =>
                        roomDetail.open({ kind: "available", room }, trigger)
                      }
                      room={room}
                    />
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
        </section>
      </div>
    </PlatformShell>
  );
}

type RoomListSectionProps = Readonly<{
  children: ReactNode;
  title: string;
}>;

function RoomListSection({ children, title }: RoomListSectionProps) {
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-bold leading-7 tracking-[-0.02em]">{title}</h2>
      {children}
    </section>
  );
}

export function MyRoomCard({
  isDetailOpen,
  onOpenDetails,
  room,
}: Readonly<{
  isDetailOpen: boolean;
  onOpenDetails: (trigger: HTMLButtonElement) => void;
  room: RoomInboxListItem;
}>) {
  const memberCount = getChatRoomMemberCountPresentation(room.activeMemberCount);
  const unread = getChatRoomUnreadBadgePresentation(room.unreadCount, room.unreadCountCapped);

  return (
    <article
      className="relative isolate grid h-[120px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--chat-publishing-radius-card)] border border-[var(--chat-publishing-color-border)] bg-white px-5 py-4"
      data-room-id={room.roomId}
    >
      <Link
        aria-label={`${room.name} 채팅방 입장`}
        className="absolute -inset-px z-0 cursor-pointer rounded-[var(--chat-publishing-radius-card)] border border-transparent transition hover:border-[var(--chat-publishing-color-primary)] hover:bg-[var(--chat-publishing-color-accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
        href={`/chat/${room.roomId}`}
      >
        <span className="sr-only">{room.name} 채팅방 입장</span>
      </Link>
      <span className="pointer-events-none relative z-[1] min-w-0 flex-1">
        <ChatRoomCategoryBadges categories={room.categorySummaries} fitAvailableWidth />
        <strong className="mt-1 block truncate text-[17px] font-bold leading-6 text-[var(--chat-publishing-color-text)]">
          {room.name}
        </strong>
        <span className="mt-1 flex min-w-0 items-center gap-1 text-sm leading-5 text-[var(--chat-publishing-color-muted)]">
          <span aria-label={memberCount.ariaLabel} className="shrink-0">
            {memberCount.text}
          </span>
          <span aria-hidden="true">·</span>
          <span aria-label={unread?.ariaLabel ?? "새 메시지 없음"} className="min-w-0 truncate">
            {unread ? `읽지 않음 ${unread.text}` : "새 메시지 없음"}
          </span>
        </span>
      </span>
      <button
        aria-controls={CHAT_ROOM_LIST_DETAIL_DIALOG_ID}
        aria-expanded={isDetailOpen}
        aria-haspopup="dialog"
        aria-label={`${room.name} 자세히 보기`}
        className="relative z-[2] inline-flex h-12 min-w-[108px] shrink-0 cursor-pointer items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-primary)] bg-white px-4 text-base font-bold text-[var(--chat-publishing-color-primary)] transition hover:text-[var(--chat-publishing-color-primary-emphasis)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
        id={getChatRoomListDetailTriggerId(room.roomId)}
        onClick={(event) => onOpenDetails(event.currentTarget)}
        type="button"
      >
        자세히 보기
      </button>
    </article>
  );
}

export function PublicRoomCard({
  isDetailOpen,
  onOpenDetails,
  room,
}: Readonly<{
  isDetailOpen: boolean;
  onOpenDetails: (trigger: HTMLButtonElement) => void;
  room: PublicRoomListItem;
}>) {
  return (
    <article
      className="relative isolate grid h-[120px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--chat-publishing-radius-card)] border border-[var(--chat-publishing-color-border)] bg-white px-5 py-4"
      data-room-id={room.roomId}
    >
      <button
        aria-controls={CHAT_ROOM_LIST_DETAIL_DIALOG_ID}
        aria-expanded={isDetailOpen}
        aria-haspopup="dialog"
        aria-label={`${room.name} 자세히 보기`}
        className="absolute -inset-px z-0 cursor-pointer rounded-[var(--chat-publishing-radius-card)] border border-transparent transition hover:border-[var(--chat-publishing-color-primary)] hover:bg-[var(--chat-publishing-color-accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
        id={getChatRoomListDetailTriggerId(room.roomId)}
        onClick={(event) => onOpenDetails(event.currentTarget)}
        type="button"
      >
        <span className="sr-only">{room.name} 자세히 보기</span>
      </button>
      <span className="pointer-events-none relative z-[1] min-w-0">
        <RoomSummary room={room} />
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none relative z-[1] inline-flex h-12 min-w-[108px] shrink-0 items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-primary)] bg-white px-4 text-base font-bold text-[var(--chat-publishing-color-primary)]"
      >
        자세히 보기
      </span>
    </article>
  );
}

function RoomSummary({ room }: { room: PublicRoomListItem }) {
  const memberCount = getChatRoomMemberCountPresentation(room.activeMemberCount);

  return (
    <span className="min-w-0 flex-1">
      <ChatRoomCategoryBadges categories={room.categorySummaries} fitAvailableWidth />
      <strong className="mt-1 block truncate text-[17px] font-bold leading-6 text-[var(--chat-publishing-color-text)]">
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

  const authenticationRequired = isChatAuthenticationRequired(error);
  const actionClassName =
    "mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-primary)] bg-white px-4 text-sm font-bold text-[var(--chat-publishing-color-primary-emphasis)] transition hover:bg-[var(--chat-publishing-color-accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]";

  return (
    <div
      className="rounded-[var(--chat-publishing-radius-card)] border border-[#ffc95c] bg-[#fff7e8] px-4 py-4 text-[var(--chat-publishing-color-text)]"
      data-chat-room-list-state="error"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-base font-bold text-[#8a5700]"
        >
          !
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold leading-6">{title}</p>
          <p className="mt-1 break-words text-sm leading-5 text-[#7a4b00]">
            {errorMessage ?? toErrorMessage(error)}
          </p>
        </div>
      </div>
      {authenticationRequired ? (
        <a className={actionClassName} href={createCurrentChatLoginHref()}>
          로그인하기
        </a>
      ) : (
        <button className={actionClassName} onClick={onRetry} type="button">
          다시 불러오기
        </button>
      )}
    </div>
  );
}

function RoomListNotice({
  description,
  message,
  size,
  variant = "default",
}: {
  description?: string;
  message: string;
  size: "participating" | "public";
  variant?: "all-read" | "default" | "no-available-rooms" | "no-participating-rooms";
}) {
  const isIllustrated = variant !== "default";

  return (
    <div
      className={`flex items-center justify-center px-5 text-center ${
        size === "participating" ? "min-h-[252px]" : "min-h-[384px]"
      }`}
      data-chat-room-list-state="empty"
      data-chat-room-list-empty-variant={variant}
    >
      {isIllustrated ? (
        <div
          className={`grid justify-items-center gap-1.5 ${
            variant === "no-available-rooms" ? "-translate-y-6" : ""
          }`}
        >
          <span
            aria-hidden="true"
            className="mb-2 flex size-10 items-center justify-center rounded-full bg-[var(--chat-publishing-color-primary)] text-xl font-bold text-white shadow-sm"
          >
            {variant === "all-read" ? (
              "✓"
            ) : (
              <svg className="size-5" fill="none" viewBox="0 0 20 20">
                <path
                  d="M5 4.5h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3.17a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
              </svg>
            )}
          </span>
          <p className="text-base font-medium leading-6 text-[var(--chat-publishing-color-text)]">
            {message}
          </p>
          <p className="text-sm leading-5 text-[var(--chat-publishing-color-muted)]">
            {description}
          </p>
        </div>
      ) : (
        <p className="text-sm font-medium leading-5 text-[var(--chat-publishing-color-muted)]">
          {message}
        </p>
      )}
    </div>
  );
}

function RoomListSkeleton({
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
      <button
        className="inline-flex min-h-11 items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-border)] bg-white px-5 text-sm font-bold text-[var(--chat-publishing-color-text)] transition hover:bg-[var(--chat-publishing-color-neutral-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isFetching}
        onClick={onClick}
        type="button"
      >
        {isFetching ? "불러오는 중…" : label}
      </button>
    </div>
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
