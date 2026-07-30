"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { ChatConnectionStatus } from "@/components/chat-connection-status";
import { useMyRoomsQuery, usePublicRoomsQuery } from "@/lib/chat/chat-room-queries";
import type { MyRoomListItem, PublicRoomListItem } from "@/lib/chat/chat-room-contracts";

const ROOM_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeZone: "Asia/Seoul",
});

export function ChatRoomListScreen() {
  const myRooms = useMyRoomsQuery();
  const publicRooms = usePublicRoomsQuery();
  const participatingRoomIds = useMemo(
    () => new Set(myRooms.rooms.map((room) => room.roomId)),
    [myRooms.rooms],
  );
  const discoverableRooms = useMemo(
    () => publicRooms.rooms.filter((room) => !participatingRoomIds.has(room.roomId)),
    [participatingRoomIds, publicRooms.rooms],
  );

  return (
    <div className="page-stack">
      <section className="hero hero-compact">
        <p className="eyebrow">Chat rooms</p>
        <h1>채팅방</h1>
        <p>
          Chat Resource Server의 실제 참여 방과 공개 방을 조회합니다. 방 생성과 공개 방 참여는 다음
          Command 연동 단계에서 활성화됩니다.
        </p>
        <ChatConnectionStatus />
      </section>

      <RoomListSection
        action={
          <button
            className="primary-button cursor-not-allowed opacity-50"
            disabled
            title="방 생성 Command 연동 후 활성화됩니다."
            type="button"
          >
            새 채팅방
          </button>
        }
        eyebrow="My rooms"
        title="참여 중인 방"
      >
        <QueryFailure
          error={myRooms.error}
          onRetry={() => void myRooms.refetch()}
          title="참여 중인 방을 불러오지 못했습니다."
          visible={myRooms.isError}
        />

        {myRooms.isPending && myRooms.rooms.length === 0 ? (
          <RoomListNotice message="참여 중인 방을 불러오고 있습니다." />
        ) : myRooms.rooms.length === 0 && !myRooms.isError ? (
          <RoomListNotice message="현재 참여 중인 방이 없습니다." />
        ) : myRooms.rooms.length > 0 ? (
          <ul className="grid gap-3">
            {myRooms.rooms.map((room) => (
              <li key={room.roomId}>
                <MyRoomCard room={room} />
              </li>
            ))}
          </ul>
        ) : null}

        <LoadMoreButton
          hasNextPage={myRooms.hasNextPage}
          isFetching={myRooms.isFetchingNextPage}
          label="참여 중인 방 더 보기"
          onClick={() => void myRooms.fetchNextPage()}
        />
      </RoomListSection>

      <RoomListSection eyebrow="Discover" title="공개 방 탐색">
        <p className="-mt-3 mb-5 text-sm text-slate-500">
          이미 불러온 참여 방은 이 목록에서 제외합니다. 공개 방 참여는 아직 비활성화되어 있습니다.
        </p>

        <QueryFailure
          error={publicRooms.error}
          onRetry={() => void publicRooms.refetch()}
          title="공개 방을 불러오지 못했습니다."
          visible={publicRooms.isError}
        />

        {publicRooms.isPending && publicRooms.rooms.length === 0 ? (
          <RoomListNotice message="공개 방을 불러오고 있습니다." />
        ) : discoverableRooms.length === 0 && !publicRooms.isError ? (
          <RoomListNotice message="현재 새로 참여할 수 있는 공개 방이 없습니다." />
        ) : discoverableRooms.length > 0 ? (
          <ul className="grid gap-3">
            {discoverableRooms.map((room) => (
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
          onClick={() => void publicRooms.fetchNextPage()}
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

function MyRoomCard({ room }: { room: MyRoomListItem }) {
  return (
    <Link
      className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:bg-blue-50"
      href={`/chat/${room.roomId}`}
    >
      <RoomAvatar name={room.name} />
      <RoomSummary room={room}>
        <span className="status">
          {room.membershipRole} · {room.membershipStatus}
        </span>
      </RoomSummary>
    </Link>
  );
}

function PublicRoomCard({ room }: { room: PublicRoomListItem }) {
  const isOpen = room.joinPolicy === "OPEN";

  return (
    <article className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
      <RoomAvatar name={room.name} />
      <RoomSummary room={room}>
        <span className="status">{room.joinPolicy}</span>
      </RoomSummary>
      <button
        className="secondary-button shrink-0 cursor-not-allowed opacity-50"
        disabled
        title={isOpen ? "방 참여 Command 연동 후 활성화됩니다." : "초대 전용 방입니다."}
        type="button"
      >
        {isOpen ? "참여 예정" : "초대 전용"}
      </button>
    </article>
  );
}

function RoomAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-12 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700"
    >
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
