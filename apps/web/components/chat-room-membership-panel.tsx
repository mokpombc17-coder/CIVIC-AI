"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChatRoomCategoryBadges } from "@/components/chat-room-category-badges";
import { ChatRoomSettingsControl } from "@/components/chat-room-settings-dialog";
import { selectRetryableChatCommand } from "@/lib/chat/chat-command-retry";
import type {
  MembershipStatus,
  RoomDetails,
  RoomMembership,
  RoomMembershipListItem,
  TargetUserRequest,
} from "@/lib/chat/chat-room-contracts";
import {
  useBanRoomMemberMutation,
  useCloseRoomMutation,
  useLeaveRoomMutation,
  useTransferRoomOwnershipMutation,
  useUnbanRoomMemberMutation,
} from "@/lib/chat/chat-room-mutations";
import { useMyRoomMembershipQuery, useRoomMembershipsQuery } from "@/lib/chat/chat-room-queries";
import { createIdempotentCommand, type IdempotentCommand } from "@/lib/chat/idempotent-command";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

const MEMBERSHIP_STATUS_LABEL: Record<MembershipStatus, string> = {
  ACTIVE: "참여 중",
  LEFT: "나감",
  BANNED: "차단됨",
};

type RoomManagementCommand =
  | Readonly<{
      kind: "leave" | "close";
      command: IdempotentCommand<undefined>;
    }>
  | Readonly<{
      kind: "transfer" | "ban" | "unban";
      command: IdempotentCommand<TargetUserRequest>;
      targetUserId: string;
    }>;

type RoomManagementCommandKind = RoomManagementCommand["kind"];

const COMMAND_LABEL: Record<RoomManagementCommandKind, string> = {
  leave: "방 나가기",
  close: "방 종료",
  transfer: "방장 위임",
  ban: "멤버 차단",
  unban: "차단 해제",
};

const COMMAND_SUCCESS_MESSAGE: Record<RoomManagementCommandKind, string> = {
  leave: "채팅방에서 나갔습니다.",
  close: "채팅방을 종료했습니다.",
  transfer: "방장을 위임했습니다.",
  ban: "멤버를 차단했습니다.",
  unban: "멤버의 차단을 해제했습니다.",
};

export function ChatRoomMembershipPanel({
  headerAction,
  headingId,
  room,
  roomId,
}: {
  headerAction?: ReactNode;
  headingId?: string;
  room: RoomDetails;
  roomId: string;
}) {
  const router = useRouter();
  const [membershipStatus, setMembershipStatus] = useState<MembershipStatus>("ACTIVE");
  const [pendingCommand, setPendingCommand] = useState<RoomManagementCommand | null>(null);
  const [failedCommand, setFailedCommand] = useState<RoomManagementCommand | null>(null);
  const [commandError, setCommandError] = useState<unknown>(null);
  const [commandSuccess, setCommandSuccess] = useState<string | null>(null);
  const membershipQuery = useMyRoomMembershipQuery(roomId, {
    enabled: room.myMembership !== null,
  });
  const membership = membershipQuery.data ?? room.myMembership;
  const isOwner =
    room.status === "ACTIVE" &&
    membership?.status === "ACTIVE" &&
    membership.role === "OWNER" &&
    membership.membershipId === room.ownerMembershipId;
  const membershipsQuery = useRoomMembershipsQuery(roomId, {
    enabled: isOwner,
    status: membershipStatus,
  });
  const leaveRoom = useLeaveRoomMutation();
  const transferOwnership = useTransferRoomOwnershipMutation();
  const banMember = useBanRoomMemberMutation();
  const unbanMember = useUnbanRoomMemberMutation();
  const closeRoom = useCloseRoomMutation();

  async function execute(command: RoomManagementCommand): Promise<void> {
    setPendingCommand(command);
    setFailedCommand(null);
    setCommandError(null);
    setCommandSuccess(null);

    try {
      switch (command.kind) {
        case "leave":
          await leaveRoom.mutateAsync({
            roomId,
            command: command.command,
          });
          break;
        case "close":
          await closeRoom.mutateAsync({
            roomId,
            command: command.command,
          });
          break;
        case "transfer":
          await transferOwnership.mutateAsync({
            roomId,
            command: command.command,
          });
          break;
        case "ban":
          await banMember.mutateAsync({
            roomId,
            command: command.command,
          });
          break;
        case "unban":
          await unbanMember.mutateAsync({
            roomId,
            command: command.command,
          });
          break;
      }

      setCommandSuccess(COMMAND_SUCCESS_MESSAGE[command.kind]);

      if (command.kind === "leave" || command.kind === "close") {
        router.push("/chat");
      }
    } catch (error) {
      setFailedCommand(command);
      setCommandError(error);
    } finally {
      setPendingCommand(null);
    }
  }

  function startRoomCommand(kind: "leave" | "close") {
    const prompt =
      kind === "leave"
        ? "이 채팅방에서 나갈까요?"
        : "채팅방을 종료할까요? 종료한 방은 다시 활성화할 수 없습니다.";

    if (!window.confirm(prompt)) {
      return;
    }

    void execute({
      kind,
      command: createIdempotentCommand(undefined),
    });
  }

  function startMemberCommand(kind: "transfer" | "ban" | "unban", targetUserId: string) {
    const prompt =
      kind === "transfer"
        ? `${targetUserId} 사용자에게 방장을 위임할까요?`
        : kind === "ban"
          ? `${targetUserId} 사용자를 이 방에서 차단할까요?`
          : `${targetUserId} 사용자의 차단을 해제할까요?`;

    if (!window.confirm(prompt)) {
      return;
    }

    void execute({
      kind,
      targetUserId,
      command: createIdempotentCommand({ targetUserId }),
    });
  }

  const retryCommand = selectRetryableChatCommand(failedCommand, commandError);
  const isCommandPending = pendingCommand !== null;

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Room membership</p>
          <h2 id={headingId}>방 정보와 멤버십</h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="status">version {room.version}</span>
          {isOwner ? <ChatRoomSettingsControl room={room} /> : null}
          {headerAction}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RoomDetailsCard room={room} />
        <MyMembershipCard
          error={membershipQuery.error}
          isError={membershipQuery.isError}
          isFetching={membershipQuery.isFetching}
          membership={membership}
          onRetry={() => void membershipQuery.refetch()}
        />
      </div>

      {room.status === "ACTIVE" && membership?.status === "ACTIVE" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {membership.role === "MEMBER" ? (
            <button
              className="secondary-button"
              disabled={isCommandPending}
              onClick={() => startRoomCommand("leave")}
              type="button"
            >
              {pendingCommand?.kind === "leave" ? "나가는 중…" : "방 나가기"}
            </button>
          ) : (
            <button
              className="secondary-button border-red-300 text-red-700"
              disabled={isCommandPending}
              onClick={() => startRoomCommand("close")}
              type="button"
            >
              {pendingCommand?.kind === "close" ? "종료 중…" : "방 종료"}
            </button>
          )}
        </div>
      ) : null}

      {commandError ? (
        <div
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-950"
          role="alert"
        >
          <p className="text-sm font-semibold">
            {failedCommand
              ? `${COMMAND_LABEL[failedCommand.kind]}에 실패했습니다.`
              : "요청에 실패했습니다."}
          </p>
          <p className="mt-1 text-xs opacity-80">{toErrorMessage(commandError)}</p>
          {retryCommand ? (
            <button
              className="secondary-button mt-3"
              disabled={isCommandPending}
              onClick={() => void execute(retryCommand)}
              type="button"
            >
              같은 요청으로 다시 시도
            </button>
          ) : null}
        </div>
      ) : null}

      {commandSuccess ? (
        <p
          className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"
          role="status"
        >
          {commandSuccess}
        </p>
      ) : null}

      {isOwner ? (
        <OwnerMembershipList
          error={membershipsQuery.error}
          hasNextPage={membershipsQuery.hasNextPage}
          isCommandPending={isCommandPending}
          isError={membershipsQuery.isError}
          isFetchingNextPage={membershipsQuery.isFetchingNextPage}
          isPending={membershipsQuery.isPending}
          memberships={membershipsQuery.memberships}
          onFetchNextPage={() => void membershipsQuery.fetchNextPage()}
          onMemberCommand={startMemberCommand}
          onRetry={() => void membershipsQuery.refetch()}
          onStatusChange={setMembershipStatus}
          pendingCommand={pendingCommand}
          status={membershipStatus}
        />
      ) : null}
    </section>
  );
}

function RoomDetailsCard({ room }: { room: RoomDetails }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-950">방 상세</h3>
      <dl className="mt-3 grid gap-2 text-sm">
        <DetailRow label="방 이름" value={room.name} />
        <DetailRow label="방 설명" value={room.description || "설명 없음"} />
        <DetailRow
          label="카테고리"
          value={<ChatRoomCategoryBadges categories={room.categories} />}
        />
        <DetailRow label="방 ID" value={room.roomId} />
        <DetailRow label="공개 범위" value={room.visibility} />
        <DetailRow label="참여 정책" value={room.joinPolicy} />
        <DetailRow label="방 상태" value={room.status} />
        <DetailRow label="방장 사용자" value={room.ownerUserId} />
        <DetailRow label="생성 시각" value={formatDateTime(room.createdAt)} />
        {room.closedAt ? (
          <DetailRow label="종료 시각" value={formatDateTime(room.closedAt)} />
        ) : null}
      </dl>
    </article>
  );
}

function MyMembershipCard({
  error,
  isError,
  isFetching,
  membership,
  onRetry,
}: {
  error: unknown;
  isError: boolean;
  isFetching: boolean;
  membership: RoomMembership | null;
  onRetry: () => void;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-950">내 멤버십</h3>
        {isFetching ? <span className="text-xs text-slate-500">동기화 중…</span> : null}
      </div>

      {isError ? (
        <div className="mt-3 text-red-700" role="alert">
          <p className="text-xs">{toErrorMessage(error)}</p>
          <button className="secondary-button mt-3" onClick={onRetry} type="button">
            내 멤버십 다시 불러오기
          </button>
        </div>
      ) : membership ? (
        <dl className="mt-3 grid gap-2 text-sm">
          <DetailRow label="사용자 ID" value={membership.userId} />
          <DetailRow label="역할" value={membership.role} />
          <DetailRow label="상태" value={MEMBERSHIP_STATUS_LABEL[membership.status]} />
          <DetailRow label="참여 시각" value={formatDateTime(membership.joinedAt)} />
          <DetailRow label="멤버십 version" value={String(membership.version)} />
        </dl>
      ) : (
        <p className="mt-3 text-sm text-slate-500">이 방의 멤버십이 없습니다.</p>
      )}
    </article>
  );
}

function OwnerMembershipList({
  error,
  hasNextPage,
  isCommandPending,
  isError,
  isFetchingNextPage,
  isPending,
  memberships,
  onFetchNextPage,
  onMemberCommand,
  onRetry,
  onStatusChange,
  pendingCommand,
  status,
}: {
  error: unknown;
  hasNextPage: boolean;
  isCommandPending: boolean;
  isError: boolean;
  isFetchingNextPage: boolean;
  isPending: boolean;
  memberships: readonly RoomMembershipListItem[];
  onFetchNextPage: () => void;
  onMemberCommand: (kind: "transfer" | "ban" | "unban", targetUserId: string) => void;
  onRetry: () => void;
  onStatusChange: (status: MembershipStatus) => void;
  pendingCommand: RoomManagementCommand | null;
  status: MembershipStatus;
}) {
  return (
    <div className="mt-6 border-t border-slate-200 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Owner controls</p>
          <h3 className="text-lg font-bold text-slate-950">멤버 관리</h3>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="멤버 상태 필터">
          {(["ACTIVE", "LEFT", "BANNED"] as const).map((value) => (
            <button
              aria-pressed={status === value}
              className={status === value ? "primary-button" : "secondary-button"}
              key={value}
              onClick={() => onStatusChange(value)}
              type="button"
            >
              {MEMBERSHIP_STATUS_LABEL[value]}
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <div
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-950"
          role="alert"
        >
          <p className="text-sm font-semibold">멤버 목록을 불러오지 못했습니다.</p>
          <p className="mt-1 text-xs opacity-80">{toErrorMessage(error)}</p>
          <button className="secondary-button mt-3" onClick={onRetry} type="button">
            멤버 목록 다시 불러오기
          </button>
        </div>
      ) : isPending ? (
        <MembershipNotice message="멤버 목록을 불러오고 있습니다." />
      ) : memberships.length === 0 ? (
        <MembershipNotice message={`${MEMBERSHIP_STATUS_LABEL[status]} 상태의 멤버가 없습니다.`} />
      ) : (
        <ul className="mt-4 grid gap-3">
          {memberships.map((member) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
              key={member.membershipId}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{member.userId}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {member.role} · {MEMBERSHIP_STATUS_LABEL[member.status]} · version{" "}
                  {member.version}
                </p>
              </div>
              {member.role === "MEMBER" && member.status === "ACTIVE" ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    className="secondary-button"
                    disabled={isCommandPending}
                    onClick={() => onMemberCommand("transfer", member.userId)}
                    type="button"
                  >
                    {isPendingForMember(pendingCommand, "transfer", member.userId)
                      ? "위임 중…"
                      : "방장 위임"}
                  </button>
                  <button
                    className="secondary-button border-red-300 text-red-700"
                    disabled={isCommandPending}
                    onClick={() => onMemberCommand("ban", member.userId)}
                    type="button"
                  >
                    {isPendingForMember(pendingCommand, "ban", member.userId) ? "차단 중…" : "차단"}
                  </button>
                </div>
              ) : member.status === "BANNED" ? (
                <button
                  className="secondary-button"
                  disabled={isCommandPending}
                  onClick={() => onMemberCommand("unban", member.userId)}
                  type="button"
                >
                  {isPendingForMember(pendingCommand, "unban", member.userId)
                    ? "해제 중…"
                    : "차단 해제"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {hasNextPage ? (
        <div className="mt-4 text-center">
          <button
            className="secondary-button"
            disabled={isFetchingNextPage}
            onClick={onFetchNextPage}
            type="button"
          >
            {isFetchingNextPage ? "불러오는 중…" : "멤버 더 보기"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 whitespace-pre-line break-words font-medium text-slate-800">
        {value}
      </dd>
    </div>
  );
}

function MembershipNotice({ message }: { message: string }) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

function isPendingForMember(
  command: RoomManagementCommand | null,
  kind: "transfer" | "ban" | "unban",
  targetUserId: string,
): boolean {
  return command?.kind === kind && command.targetUserId === targetUserId;
}

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : DATE_TIME_FORMATTER.format(timestamp);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
