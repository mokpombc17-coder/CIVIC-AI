"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChatConnectionStatus } from "@/components/chat-connection-status";
import { isRetryableChatCommandError } from "@/lib/chat/chat-command-retry";
import {
  createRoomRequestSchema,
  type CreateRoomRequest,
  type MyRoomListItem,
  type PublicRoomListItem,
} from "@/lib/chat/chat-room-contracts";
import { useCreateRoomMutation, useJoinRoomMutation } from "@/lib/chat/chat-room-mutations";
import { useMyRoomsQuery, usePublicRoomsQuery } from "@/lib/chat/chat-room-queries";
import { createIdempotentCommand, type IdempotentCommand } from "@/lib/chat/idempotent-command";

const ROOM_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeZone: "Asia/Seoul",
});

export function ChatRoomListScreen() {
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
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
          Chat Resource Server의 실제 참여 방과 공개 방을 조회하고, 새 방을 만들거나 공개 방에
          참여할 수 있습니다.
        </p>
        <ChatConnectionStatus />
      </section>

      <RoomListSection
        action={
          <button
            aria-expanded={isCreateRoomOpen}
            className={
              isCreateRoomOpen ? "primary-button cursor-not-allowed opacity-50" : "primary-button"
            }
            disabled={isCreateRoomOpen}
            onClick={() => setIsCreateRoomOpen(true)}
            type="button"
          >
            {isCreateRoomOpen ? "작성 중" : "새 채팅방"}
          </button>
        }
        eyebrow="My rooms"
        title="참여 중인 방"
      >
        {isCreateRoomOpen ? <CreateRoomForm onCancel={() => setIsCreateRoomOpen(false)} /> : null}

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
          이미 불러온 참여 방은 이 목록에서 제외합니다. OPEN 방은 바로 참여할 수 있고 초대 전용 방은
          목록만 확인할 수 있습니다.
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

function CreateRoomForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const createRoom = useCreateRoomMutation();
  const [validationError, setValidationError] = useState<string | null>(null);
  const [retryCommand, setRetryCommand] = useState<IdempotentCommand<CreateRoomRequest> | null>(
    null,
  );

  function clearFailedAttempt() {
    setValidationError(null);

    if (retryCommand || createRoom.error) {
      setRetryCommand(null);
      createRoom.reset();
    }
  }

  function execute(command: IdempotentCommand<CreateRoomRequest>) {
    void createRoom
      .mutateAsync(command)
      .then((response) => router.push(`/chat/${response.roomId}`))
      .catch(() => undefined);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const request = createRoomRequestSchema.safeParse({
      name: formData.get("name"),
      description: formData.get("description"),
      visibility: formData.get("visibility"),
      joinPolicy: formData.get("joinPolicy"),
    });

    if (!request.success) {
      setValidationError(request.error.issues[0]?.message ?? "방 생성 정보를 확인해 주세요.");
      return;
    }

    createRoom.reset();
    setValidationError(null);

    const command = createIdempotentCommand(request.data);
    setRetryCommand(command);
    execute(command);
  }

  const canRetry =
    retryCommand !== null && createRoom.isError && isRetryableChatCommandError(createRoom.error);

  return (
    <form
      className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4"
      onChange={clearFailedAttempt}
      onSubmit={handleSubmit}
    >
      <fieldset className="grid gap-4" disabled={createRoom.isPending}>
        <legend className="text-sm font-semibold text-slate-950">새 채팅방 만들기</legend>

        <label className="grid gap-1 text-sm font-medium text-slate-700">
          방 이름
          <input
            autoFocus
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950"
            maxLength={100}
            name="name"
            placeholder="예: 시민 AI 토론방"
            required
          />
        </label>

        <div className="grid gap-1 text-sm text-slate-700">
          <label className="font-medium" htmlFor="create-room-description">
            방 설명 <span className="font-normal text-slate-500">(선택)</span>
          </label>
          <textarea
            aria-describedby="create-room-description-help"
            className="min-h-24 resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950"
            id="create-room-description"
            name="description"
            placeholder="이 방에서 나눌 이야기를 간단히 소개해 주세요."
            rows={3}
          />
          <span className="text-xs font-normal text-slate-500" id="create-room-description-help">
            앞뒤 공백을 제외한 최대 500자이며, 일반 텍스트로 저장됩니다.
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            공개 범위
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950"
              defaultValue="LISTED"
              name="visibility"
            >
              <option value="LISTED">공개 목록에 표시</option>
              <option value="UNLISTED">목록에 표시하지 않음</option>
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            참여 정책
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950"
              defaultValue="OPEN"
              name="joinPolicy"
            >
              <option value="OPEN">누구나 참여</option>
              <option value="INVITE_ONLY">초대 전용</option>
            </select>
          </label>
        </div>

        {validationError ? (
          <p className="text-sm text-red-700" role="alert">
            {validationError}
          </p>
        ) : null}

        {createRoom.isError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-950" role="alert">
            <p className="text-sm font-semibold">채팅방을 만들지 못했습니다.</p>
            <p className="mt-1 text-xs opacity-80">{toErrorMessage(createRoom.error)}</p>
            {canRetry ? (
              <button
                className="secondary-button mt-3"
                onClick={() => execute(retryCommand)}
                type="button"
              >
                같은 요청으로 다시 시도
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            className="secondary-button"
            disabled={createRoom.isPending}
            onClick={onCancel}
            type="button"
          >
            취소
          </button>
          <button className="primary-button" disabled={createRoom.isPending} type="submit">
            {createRoom.isPending ? "생성 중…" : "채팅방 만들기"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function PublicRoomCard({ room }: { room: PublicRoomListItem }) {
  return (
    <article className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
      <RoomAvatar name={room.name} />
      <RoomSummary room={room}>
        <span className="status">{room.joinPolicy}</span>
      </RoomSummary>
      <JoinRoomControl room={room} />
    </article>
  );
}

function JoinRoomControl({ room }: { room: PublicRoomListItem }) {
  const router = useRouter();
  const joinRoom = useJoinRoomMutation();
  const [retryCommand, setRetryCommand] = useState<IdempotentCommand<undefined> | null>(null);
  const isOpen = room.joinPolicy === "OPEN";

  function execute(command: IdempotentCommand<undefined>) {
    void joinRoom
      .mutateAsync({
        roomId: room.roomId,
        command,
      })
      .then(() => router.push(`/chat/${room.roomId}`))
      .catch(() => undefined);
  }

  function handleJoin() {
    joinRoom.reset();

    const command = createIdempotentCommand(undefined);
    setRetryCommand(command);
    execute(command);
  }

  const canRetry =
    retryCommand !== null && joinRoom.isError && isRetryableChatCommandError(joinRoom.error);

  return (
    <div className="flex max-w-64 shrink-0 flex-col items-end gap-2">
      <button
        className={isOpen ? "secondary-button" : "secondary-button cursor-not-allowed opacity-50"}
        disabled={!isOpen || joinRoom.isPending}
        onClick={handleJoin}
        title={isOpen ? "이 공개 방에 참여합니다." : "초대 전용 방입니다."}
        type="button"
      >
        {joinRoom.isPending ? "참여 중…" : isOpen ? "참여하기" : "초대 전용"}
      </button>

      {joinRoom.isError ? (
        <div className="text-right text-xs text-red-700" role="alert">
          <p>{toErrorMessage(joinRoom.error)}</p>
          {canRetry ? (
            <button
              className="mt-1 underline underline-offset-2"
              onClick={() => execute(retryCommand)}
              type="button"
            >
              같은 요청으로 다시 시도
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
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
