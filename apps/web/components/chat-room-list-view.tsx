"use client";

import Link from "next/link";
import type { ReactNode, Ref } from "react";
import { ChatConnectionStatus } from "@/components/chat-connection-status";
import { CREATE_CHAT_ROOM_FORM_ID, CreateChatRoomForm } from "@/components/create-chat-room-form";
import { getChatRoomUnreadBadgePresentation } from "@/components/chat-room-unread-badge";
import { JoinChatRoomControl } from "@/components/join-chat-room-control";
import type { PublicRoomListItem, RoomInboxListItem } from "@/lib/chat/chat-room-contracts";

const ROOM_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeZone: "Asia/Seoul",
});
const SCROLLABLE_ROOM_LIST_CLASS_NAME =
  "grid max-h-[60dvh] scroll-p-1 gap-3 overflow-y-auto overscroll-contain p-1 pr-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:max-h-[32rem] [scrollbar-gutter:stable]";

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
  publicRooms: RoomListState<PublicRoomListItem>;
  toggleCreateRoomForm: () => void;
}>;

export function ChatRoomListView({
  closeCreateRoomForm,
  createRoomTriggerRef,
  isCreateRoomOpen,
  participatingRooms,
  publicRooms,
  toggleCreateRoomForm,
}: ChatRoomListViewProps) {
  return (
    <div className="chat-room-list page-stack">
      <section className="hero hero-compact">
        <p className="eyebrow">Chat rooms</p>
        <h1>채팅방</h1>
        <p>
          Chat Resource Server의 실제 참여 방과 공개 방을 조회하고, 새 방을 만들거나 공개 방에
          참여할 수 있습니다.
        </p>
        <ChatConnectionStatus />
      </section>

      <RoomListSection
        action={
          <button
            aria-controls={CREATE_CHAT_ROOM_FORM_ID}
            aria-expanded={isCreateRoomOpen}
            className={isCreateRoomOpen ? "secondary-button" : "primary-button"}
            onClick={toggleCreateRoomForm}
            ref={createRoomTriggerRef}
            type="button"
          >
            {isCreateRoomOpen ? "작성 닫기" : "새 채팅방"}
          </button>
        }
        eyebrow="My rooms"
        title="참여 중인 방"
      >
        {isCreateRoomOpen ? <CreateChatRoomForm onCancel={closeCreateRoomForm} /> : null}

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

      <RoomListSection eyebrow="Discover" title="공개 방 탐색">
        <p className="-mt-3 mb-5 text-sm text-slate-500">
          이미 불러온 참여 방은 이 목록에서 제외합니다. OPEN 방은 바로 참여할 수 있고 초대 전용 방은
          목록만 확인할 수 있습니다.
        </p>

        <QueryFailure
          error={publicRooms.error}
          onRetry={publicRooms.retry}
          title="공개 방을 불러오지 못했습니다."
          visible={publicRooms.isError}
        />

        {publicRooms.isPending && publicRooms.rooms.length === 0 ? (
          <RoomListNotice message="공개 방을 불러오고 있습니다." />
        ) : publicRooms.rooms.length === 0 && !publicRooms.isError ? (
          <RoomListNotice message="현재 새로 참여할 수 있는 공개 방이 없습니다." />
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
  );
}

type RoomListSectionProps = Readonly<{
  action?: ReactNode;
  children: ReactNode;
  eyebrow: string;
  title: string;
}>;

function RoomListSection({ action, children, eyebrow, title }: RoomListSectionProps) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function MyRoomCard({ room }: { room: RoomInboxListItem }) {
  return (
    <Link
      className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:bg-blue-50"
      href={`/chat/${room.roomId}`}
    >
      <RoomAvatar name={room.name} />
      <RoomSummary room={room}>
        <RoomUnreadBadge room={room} />
        <span className="status">
          {room.membershipRole} · {room.membershipStatus}
        </span>
      </RoomSummary>
    </Link>
  );
}

function RoomUnreadBadge({ room }: { room: RoomInboxListItem }) {
  const badge = getChatRoomUnreadBadgePresentation(room.unreadCount, room.unreadCountCapped);

  if (!badge) {
    return null;
  }

  return (
    <span
      aria-label={badge.ariaLabel}
      className="inline-flex min-w-6 items-center justify-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white"
    >
      {badge.text}
    </span>
  );
}

function PublicRoomCard({ room }: { room: PublicRoomListItem }) {
  const isOpen = room.joinPolicy === "OPEN";

  return (
    <article className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
      <RoomAvatar name={room.name} />
      <RoomSummary room={room}>
        <span className="status">{isOpen ? "누구나 참여" : "초대 전용"}</span>
      </RoomSummary>
      <JoinChatRoomControl room={room} />
    </article>
  );
}

function RoomAvatar({ name }: { name: string }) {
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-700">
      {name.slice(0, 1)}
    </span>
  );
}

function RoomSummary({ children, room }: { children: ReactNode; room: PublicRoomListItem }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-center gap-2">
        <strong className="truncate text-slate-950">{room.name}</strong>
        {children}
      </span>
      {room.description ? (
        <span className="mt-1 line-clamp-2 block whitespace-pre-line break-words text-sm text-slate-600">
          {room.description}
        </span>
      ) : null}
      <span className="mt-1 block truncate text-xs text-slate-500">방 ID: {room.roomId}</span>
      <span className="mt-2 block text-xs text-slate-500">
        참여자 {room.activeMemberCount}명 · {formatRoomDate(room.createdAt)} 생성
      </span>
    </span>
  );
}

function QueryFailure({
  error,
  onRetry,
  title,
  visible,
}: {
  error: unknown;
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
      <p className="mt-1 text-xs opacity-80">{toErrorMessage(error)}</p>
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

function formatRoomDate(createdAt: string): string {
  const timestamp = Date.parse(createdAt);
  return Number.isNaN(timestamp) ? createdAt : ROOM_DATE_FORMATTER.format(timestamp);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
