"use client";

import Link from "next/link";
import { ChatRoomCategoryBadges } from "@/components/chat/chat-room-category-badges";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { ChatRoomInboxFilterControl } from "@/components/chat/chat-room-inbox-filter-control";
import type { ChatRoomInboxFilterController } from "@/components/chat/chat-room-inbox-filter";
import {
  getChatRoomListDetailTriggerId,
  type ChatRoomListDetailController,
} from "@/components/chat/chat-room-list-detail";
import {
  CHAT_ROOM_LIST_DETAIL_DIALOG_ID,
  ChatRoomListDetailDialog,
} from "@/components/chat/chat-room-list-detail-dialog";
import {
  ChatRoomListSkeleton,
  PARTICIPATING_ROOM_LIST_CLASS_NAME,
  PARTICIPATING_ROOM_SKELETON_KEYS,
  PUBLIC_ROOM_LIST_CLASS_NAME,
  PUBLIC_ROOM_SKELETON_KEYS,
} from "@/components/chat/chat-room-list-loading";
import {
  CHAT_ROOM_PUBLISHING_COPY,
  getChatRoomMemberCountPresentation,
} from "@/components/chat/chat-room-publishing";
import {
  CREATE_CHAT_ROOM_FORM_ID,
  CreateChatRoomForm,
} from "@/components/chat/create-chat-room-form";
import { getChatRoomUnreadBadgePresentation } from "@/components/chat/chat-room-unread-badge";
import { PublicRoomSearchForm } from "@/components/chat/public-room-search-form";
import { PlatformHeader, PlatformLoadMoreButton, PlatformShell } from "@/components/platform-shell";
import { PlatformNavigationClient } from "@/components/platform-navigation-client";
import type { PublicRoomSearchController } from "@/components/chat/use-public-room-search";
import type { PublicRoomListItem, RoomInboxListItem } from "@/lib/chat/chat-room-contracts";
import {
  createCurrentChatLoginHref,
  isChatAuthenticationRequired,
} from "@/lib/chat/chat-authentication-required";
import { getPublicRoomListErrorMessage } from "@/lib/chat/chat-room-list-error-presentation";
import { preventMobileLinkContextMenu } from "@/lib/ui/mobile-link-interaction";

const PUBLIC_ROOM_HIGHLIGHT_DURATION_MS = 1_600;
const ROOM_LIST_SCROLL_EDGE_TOLERANCE_PX = 2;

type PublicRoomLoadRequest = {
  observedFetching: boolean;
  query: string | undefined;
  roomIds: ReadonlySet<string>;
};

type PublicRoomLoadFeedback = Readonly<{
  announcement: string;
  hasLoadedAdditionalPage: boolean;
  highlightedRoomId: string | null;
  query: string | undefined;
}>;

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
  hasReachedActiveRoomLimit: boolean;
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
  hasReachedActiveRoomLimit,
  isCreateRoomOpen,
  participatingRoomFilter,
  participatingRooms,
  publicRoomSearch,
  publicRooms,
  roomDetail,
  toggleCreateRoomForm,
}: ChatRoomListViewProps) {
  const participatingRoomListRef = useRef<HTMLUListElement>(null);
  const publicRoomListRef = useRef<HTMLUListElement>(null);
  const participatingRoomListScroll = useRoomListBottomGradient(
    participatingRoomListRef,
    participatingRooms.rooms,
  );
  const publicRoomListScroll = useRoomListBottomGradient(publicRoomListRef, publicRooms.rooms);
  const publicRoomLoadRequestRef = useRef<PublicRoomLoadRequest | null>(null);
  const [publicRoomLoadFeedback, setPublicRoomLoadFeedback] = useState<PublicRoomLoadFeedback>({
    announcement: "",
    hasLoadedAdditionalPage: false,
    highlightedRoomId: null,
    query: publicRoomSearch.appliedQuery,
  });
  const isOverlayOpen = isCreateRoomOpen || roomDetail.selection !== null;
  const hasAppliedPublicRoomSearch = Boolean(publicRoomSearch.appliedQuery);
  const hasCurrentPublicRoomLoadFeedback =
    publicRoomLoadFeedback.query === publicRoomSearch.appliedQuery;
  const highlightedPublicRoomId = hasCurrentPublicRoomLoadFeedback
    ? publicRoomLoadFeedback.highlightedRoomId
    : null;
  const hasLoadedAdditionalPublicRoomPage =
    hasCurrentPublicRoomLoadFeedback && publicRoomLoadFeedback.hasLoadedAdditionalPage;
  const publicRoomLoadAnnouncement = hasCurrentPublicRoomLoadFeedback
    ? publicRoomLoadFeedback.announcement
    : "";
  const overlay = isCreateRoomOpen ? (
    <CreateChatRoomForm onCancel={closeCreateRoomForm} />
  ) : roomDetail.selection ? (
    <ChatRoomListDetailDialog onClose={roomDetail.close} selection={roomDetail.selection} />
  ) : undefined;

  useEffect(() => {
    const request = publicRoomLoadRequestRef.current;

    if (!request) return;
    if (request.query !== publicRoomSearch.appliedQuery) {
      publicRoomLoadRequestRef.current = null;
      return;
    }
    if (publicRooms.isFetchingNextPage) {
      request.observedFetching = true;
      return;
    }
    if (!request.observedFetching || publicRooms.isError) return;

    publicRoomLoadRequestRef.current = null;
    const firstNewRoomIndex = findFirstNewPublicRoomIndex(request.roomIds, publicRooms.rooms);
    const firstNewRoom = firstNewRoomIndex < 0 ? null : publicRooms.rooms[firstNewRoomIndex];

    setPublicRoomLoadFeedback({
      announcement: firstNewRoom
        ? "새로운 토론방을 불러왔습니다."
        : "추가로 표시할 토론방이 없습니다.",
      hasLoadedAdditionalPage: true,
      highlightedRoomId: firstNewRoom?.roomId ?? null,
      query: publicRoomSearch.appliedQuery,
    });

    if (!firstNewRoom) return;

    const firstNewRoomElement = publicRoomListRef.current?.children.item(firstNewRoomIndex);

    if (firstNewRoomElement instanceof HTMLElement) {
      scrollPublicRoomIntoView(
        firstNewRoomElement,
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
      );
    }
  }, [
    publicRoomSearch.appliedQuery,
    publicRooms.isError,
    publicRooms.isFetchingNextPage,
    publicRooms.rooms,
  ]);

  useEffect(() => {
    if (!highlightedPublicRoomId) return;

    const timeout = window.setTimeout(() => {
      setPublicRoomLoadFeedback((current) =>
        current.highlightedRoomId === highlightedPublicRoomId
          ? { ...current, highlightedRoomId: null }
          : current,
      );
    }, PUBLIC_ROOM_HIGHLIGHT_DURATION_MS);

    return () => window.clearTimeout(timeout);
  }, [highlightedPublicRoomId]);

  function loadMorePublicRooms() {
    if (publicRooms.isFetchingNextPage) return;

    publicRoomLoadRequestRef.current = {
      observedFetching: false,
      query: publicRoomSearch.appliedQuery,
      roomIds: new Set(publicRooms.rooms.map((room) => room.roomId)),
    };
    setPublicRoomLoadFeedback((current) => ({
      announcement: "",
      hasLoadedAdditionalPage:
        current.query === publicRoomSearch.appliedQuery && current.hasLoadedAdditionalPage,
      highlightedRoomId: null,
      query: publicRoomSearch.appliedQuery,
    }));
    publicRooms.loadMore();
  }

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
          aria-label="참여한 방 필터와 토론방 생성 요청"
          className="flex items-center justify-between gap-3"
        >
          <ChatRoomInboxFilterControl controller={participatingRoomFilter} />
          <button
            aria-controls={CREATE_CHAT_ROOM_FORM_ID}
            aria-expanded={isCreateRoomOpen}
            className="inline-flex h-12 cursor-pointer items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-primary)] bg-[var(--chat-publishing-color-accent-soft)] px-4 text-base font-bold leading-5 text-[var(--chat-publishing-color-primary-emphasis)] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={toggleCreateRoomForm}
            ref={createRoomTriggerRef}
            type="button"
          >
            {CHAT_ROOM_PUBLISHING_COPY.createRoom}
          </button>
        </section>

        <RoomListSection
          description={
            hasReachedActiveRoomLimit ? CHAT_ROOM_PUBLISHING_COPY.activeRoomLimitReached : undefined
          }
          title="참여한 방"
        >
          <QueryFailure
            error={participatingRooms.error}
            onRetry={participatingRooms.retry}
            title="참여 중인 방을 불러오지 못했습니다."
            visible={participatingRooms.isError}
          />

          {participatingRooms.isPending && participatingRooms.rooms.length === 0 ? (
            <ChatRoomListSkeleton
              ariaLabel="참여 중인 토론방을 불러오는 중"
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
              message="아직 참여한 토론방이 없어요"
              size="participating"
              variant="no-participating-rooms"
            />
          ) : participatingRooms.rooms.length > 0 ? (
            <div className="relative">
              <ul
                aria-label="참여 중인 토론방"
                className={PARTICIPATING_ROOM_LIST_CLASS_NAME}
                onScroll={participatingRoomListScroll.update}
                ref={participatingRoomListRef}
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
              <RoomListBottomGradient visible={participatingRoomListScroll.visible} />
            </div>
          ) : null}

          <PlatformLoadMoreButton
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
              <ChatRoomListSkeleton
                ariaLabel="참여 가능한 토론방을 불러오는 중"
                keys={PUBLIC_ROOM_SKELETON_KEYS}
                listClassName={PUBLIC_ROOM_LIST_CLASS_NAME}
                message="공개 방을 불러오고 있습니다."
              />
            ) : publicRooms.rooms.length === 0 && !publicRooms.isError ? (
              hasAppliedPublicRoomSearch ? (
                <RoomListNotice
                  description="다른 검색어로 다시 찾아보세요."
                  message={CHAT_ROOM_PUBLISHING_COPY.noPublicRoomSearchResults}
                  size="public"
                  variant="no-search-results"
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
              <div className="relative">
                <ul
                  aria-label="공개 토론방"
                  className={PUBLIC_ROOM_LIST_CLASS_NAME}
                  onScroll={publicRoomListScroll.update}
                  ref={publicRoomListRef}
                  tabIndex={0}
                >
                  {publicRooms.rooms.map((room) => (
                    <li key={room.roomId}>
                      <PublicRoomCard
                        highlighted={highlightedPublicRoomId === room.roomId}
                        isDetailOpen={roomDetail.selection?.room.roomId === room.roomId}
                        onOpenDetails={(trigger) =>
                          roomDetail.open({ kind: "available", room }, trigger)
                        }
                        room={room}
                      />
                    </li>
                  ))}
                </ul>
                <RoomListBottomGradient visible={publicRoomListScroll.visible} />
              </div>
            ) : null}

            <PlatformLoadMoreButton
              exhaustedLabel={
                hasLoadedAdditionalPublicRoomPage ? "모든 토론방을 확인했어요." : undefined
              }
              hasNextPage={publicRooms.hasNextPage}
              isFetching={publicRooms.isFetchingNextPage}
              label="공개 방 더 보기"
              onClick={loadMorePublicRooms}
            />
            <p aria-atomic="true" aria-live="polite" className="sr-only">
              {publicRoomLoadAnnouncement}
            </p>
          </RoomListSection>
        </section>
      </div>
    </PlatformShell>
  );
}

type RoomListSectionProps = Readonly<{
  children: ReactNode;
  description?: ReactNode;
  title: string;
}>;

function RoomListSection({ children, description, title }: RoomListSectionProps) {
  return (
    <section className="grid gap-3">
      <div className="grid gap-1">
        <h2 className="text-lg font-bold leading-[27px]">{title}</h2>
        {description ? (
          <p className="whitespace-nowrap text-[13px] leading-[19.5px] text-[var(--chat-publishing-color-muted)]">
            {description}
          </p>
        ) : null}
      </div>
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
      className="relative isolate h-[120px] rounded-[var(--chat-publishing-radius-card)] border border-[var(--chat-publishing-color-border)]"
      data-room-id={room.roomId}
    >
      <Link
        aria-label={`${room.name} 토론방 입장`}
        className="peer absolute inset-0 z-0 cursor-pointer select-none rounded-[var(--chat-publishing-radius-card)] [-webkit-touch-callout:none] focus-visible:outline-none"
        draggable={false}
        href={`/chat/${room.roomId}`}
        onContextMenu={preventMobileLinkContextMenu}
        title={room.name}
      >
        <span className="sr-only">{room.name} 토론방 입장</span>
      </Link>
      <RoomCardInteractionSurface>
        <span className="min-w-0 flex-1">
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
          aria-label={`${room.name} 상세 정보 보기`}
          className="pointer-events-auto relative z-[2] inline-flex h-12 min-w-[108px] shrink-0 cursor-pointer items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-primary)] bg-white px-4 text-base font-bold leading-5 text-[var(--chat-publishing-color-primary-emphasis)] transition hover:text-[var(--chat-publishing-color-primary-emphasis)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
          id={getChatRoomListDetailTriggerId(room.roomId)}
          onClick={(event) => onOpenDetails(event.currentTarget)}
          type="button"
        >
          상세보기
        </button>
      </RoomCardInteractionSurface>
    </article>
  );
}

export function PublicRoomCard({
  highlighted = false,
  isDetailOpen,
  onOpenDetails,
  room,
}: Readonly<{
  highlighted?: boolean;
  isDetailOpen: boolean;
  onOpenDetails: (trigger: HTMLButtonElement) => void;
  room: PublicRoomListItem;
}>) {
  return (
    <article
      className="relative isolate h-[120px] rounded-[var(--chat-publishing-radius-card)] border border-[var(--chat-publishing-color-border)]"
      data-new-public-room={highlighted || undefined}
      data-room-id={room.roomId}
    >
      <button
        aria-controls={CHAT_ROOM_LIST_DETAIL_DIALOG_ID}
        aria-expanded={isDetailOpen}
        aria-haspopup="dialog"
        aria-label={`${room.name} 참여하기`}
        className="peer absolute inset-0 z-0 cursor-pointer rounded-[var(--chat-publishing-radius-card)] focus-visible:outline-none"
        id={getChatRoomListDetailTriggerId(room.roomId)}
        onClick={(event) => onOpenDetails(event.currentTarget)}
        title={room.name}
        type="button"
      >
        <span className="sr-only">{room.name} 참여하기</span>
      </button>
      <RoomCardInteractionSurface highlighted={highlighted}>
        <span className="min-w-0">
          <RoomSummary room={room} />
        </span>
        <span
          aria-hidden="true"
          className="inline-flex h-12 min-w-[108px] shrink-0 items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-primary)] bg-white px-4 text-base font-bold leading-5 text-[var(--chat-publishing-color-primary-emphasis)]"
        >
          참여하기
        </span>
      </RoomCardInteractionSurface>
    </article>
  );
}

function RoomCardInteractionSurface({
  children,
  highlighted = false,
}: Readonly<{
  children: ReactNode;
  highlighted?: boolean;
}>) {
  // 모바일에서 짧게 탭하면 손을 떼기 전에 180ms 전환이 끝나지 않아 눌림 효과가 안 보였으므로, 누를 때는 색과 크기를 즉시 바꾸고 뗄 때만 서서히 되돌림
  return (
    <div
      className={`pointer-events-none absolute inset-0 z-[1] isolate grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-[var(--chat-publishing-radius-card)] border border-transparent bg-white px-5 py-4 transition-[background-color,transform] duration-[180ms] ease-in-out after:pointer-events-none after:absolute after:inset-0 after:z-0 after:rounded-[inherit] after:bg-[var(--chat-publishing-color-accent-soft)] after:transition-opacity after:duration-700 after:content-[''] peer-hover:bg-[var(--chat-publishing-color-accent-soft)] peer-focus-visible:border-[var(--chat-publishing-color-primary)] peer-active:[transform:scale(0.90)] peer-active:!border-transparent peer-active:bg-[var(--chat-publishing-color-accent-soft)] peer-active:transition-none motion-reduce:!transform-none motion-reduce:transition-none motion-reduce:after:transition-none [&>*]:relative [&>*]:z-[1] ${
        highlighted ? "after:opacity-100" : "after:opacity-0"
      }`}
    >
      {children}
    </div>
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
  variant?:
    "all-read" | "default" | "no-available-rooms" | "no-participating-rooms" | "no-search-results";
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
            data-chat-room-list-empty-icon={
              variant === "all-read" ? "check" : variant === "no-search-results" ? "search" : "chat"
            }
          >
            {variant === "all-read" ? (
              "✓"
            ) : variant === "no-search-results" ? (
              <svg className="size-5" fill="none" viewBox="0 0 20 20">
                <circle cx="8.5" cy="8.5" r="4.5" stroke="currentColor" strokeWidth="1.8" />
                <path
                  d="m12 12 4 4"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.8"
                />
              </svg>
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

// 목록 안에서 스크롤해야 볼 수 있는 방이 남아 있을 때만 하단 gradient를 보여, 상자 높이에서 잘린 카드가 아래로 이어진다는 단서를 줌
function useRoomListBottomGradient(
  listRef: RefObject<HTMLUListElement | null>,
  rooms: readonly unknown[],
) {
  const [visible, setVisible] = useState(false);
  const update = useCallback(() => {
    const nextVisible = listRef.current ? shouldShowRoomListBottomGradient(listRef.current) : false;

    setVisible((current) => (current === nextVisible ? current : nextVisible));
  }, [listRef]);

  // 본문에서 읽지 않는 rooms는 방 목록이 바뀌어 넘침 여부가 달라질 때 다시 계산하게 하는 실행 계기임
  useEffect(() => {
    update();

    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(list);

    return () => resizeObserver.disconnect();
  }, [listRef, rooms, update]);

  return { update, visible };
}

function RoomListBottomGradient({ visible }: Readonly<{ visible: boolean }>) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 h-6 bg-gradient-to-t from-white/90 to-transparent motion-safe:transition-opacity motion-safe:duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
      data-room-list-scroll-indicator="down"
    />
  );
}

export function findFirstNewPublicRoomIndex(
  previousRoomIds: ReadonlySet<string>,
  rooms: readonly PublicRoomListItem[],
): number {
  return rooms.findIndex((room) => !previousRoomIds.has(room.roomId));
}

export function shouldShowRoomListBottomGradient(
  scrollContainer: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop">,
): boolean {
  const hasScrollableOverflow =
    scrollContainer.scrollHeight - scrollContainer.clientHeight >
    ROOM_LIST_SCROLL_EDGE_TOLERANCE_PX;

  return (
    hasScrollableOverflow &&
    scrollContainer.scrollTop + scrollContainer.clientHeight <
      scrollContainer.scrollHeight - ROOM_LIST_SCROLL_EDGE_TOLERANCE_PX
  );
}

export function scrollPublicRoomIntoView(
  roomElement: Pick<HTMLElement, "scrollIntoView">,
  prefersReducedMotion: boolean,
): void {
  roomElement.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: "start",
  });
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
