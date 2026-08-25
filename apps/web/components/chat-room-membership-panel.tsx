"use client";

import type { ReactNode } from "react";
import { ChatRoomCategoryBadges } from "@/components/chat-room-category-badges";
import { ChatRoomParticipantProfile } from "@/components/chat-room-participant-profile";
import { ChatRoomSettingsControl } from "@/components/chat-room-settings-dialog";
import {
  useChatRoomMembershipPanel,
  type ChatRoomMemberCommandKind,
  type ChatRoomMembershipPanelController,
  type ChatRoomMembershipPendingCommand,
  type ChatRoomOwnerManagedMembershipStatus,
} from "@/components/use-chat-room-membership-panel";
import type {
  MembershipStatus,
  RoomDetails,
  RoomMembership,
  RoomMembershipListItem,
} from "@/lib/chat/chat-room-contracts";

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
  const controller = useChatRoomMembershipPanel(room, roomId);

  return (
    <ChatRoomMembershipPanelView
      controller={controller}
      {...(headerAction === undefined ? {} : { headerAction })}
      {...(headingId === undefined ? {} : { headingId })}
      room={room}
    />
  );
}

export function ChatRoomMembershipPanelView({
  controller,
  headerAction,
  headingId,
  room,
}: {
  controller: ChatRoomMembershipPanelController;
  headerAction?: ReactNode;
  headingId?: string;
  room: RoomDetails;
}) {
  const {
    activeMemberships,
    command,
    isActiveMembershipListEnabled,
    isOwner,
    ownerManagedMemberships,
    roomActionKind,
    selfMembership,
  } = controller;

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

      <div className="grid gap-4">
        <RoomDetailsCard room={room} />
        <MyMembershipCard
          errorMessage={selfMembership.errorMessage}
          isError={selfMembership.isError}
          isFetching={selfMembership.isFetching}
          membership={selfMembership.membership}
          onRetry={selfMembership.retry}
        />
      </div>

      {roomActionKind ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {roomActionKind === "leave" ? (
            <button
              className="secondary-button"
              disabled={command.isPending}
              onClick={() => command.startRoom("leave")}
              type="button"
            >
              {command.pending?.kind === "leave" ? "나가는 중…" : "방 나가기"}
            </button>
          ) : (
            <button
              className="secondary-button border-red-300 text-red-700"
              disabled={command.isPending}
              onClick={() => command.startRoom("close")}
              type="button"
            >
              {command.pending?.kind === "close" ? "종료 중…" : "방 종료"}
            </button>
          )}
        </div>
      ) : null}

      {command.error ? (
        <div
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-950"
          role="alert"
        >
          <p className="text-sm font-semibold">{command.error.title}</p>
          <p className="mt-1 text-xs opacity-80">{command.error.message}</p>
          {command.error.canRetry ? (
            <button
              className="secondary-button mt-3"
              disabled={command.isPending}
              onClick={command.retry}
              type="button"
            >
              같은 요청으로 다시 시도
            </button>
          ) : null}
        </div>
      ) : null}

      {command.successMessage ? (
        <p
          className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"
          role="status"
        >
          {command.successMessage}
        </p>
      ) : null}

      {isActiveMembershipListEnabled ? (
        <ActiveMembershipList
          errorMessage={activeMemberships.errorMessage}
          hasNextPage={activeMemberships.hasNextPage}
          isCommandPending={command.isPending}
          isError={activeMemberships.isError}
          isFetchingNextPage={activeMemberships.isFetchingNextPage}
          isOwner={isOwner}
          isPending={activeMemberships.isPending}
          memberships={activeMemberships.memberships}
          onFetchNextPage={activeMemberships.fetchNextPage}
          onMemberCommand={command.startMember}
          onRetry={activeMemberships.retry}
          pendingCommand={command.pending}
          selfMembershipId={selfMembership.membership?.membershipId ?? null}
        />
      ) : null}

      {isOwner ? (
        <OwnerMembershipManagement
          errorMessage={ownerManagedMemberships.errorMessage}
          hasNextPage={ownerManagedMemberships.hasNextPage}
          isCommandPending={command.isPending}
          isError={ownerManagedMemberships.isError}
          isFetchingNextPage={ownerManagedMemberships.isFetchingNextPage}
          isPending={ownerManagedMemberships.isPending}
          memberships={ownerManagedMemberships.memberships}
          onFetchNextPage={ownerManagedMemberships.fetchNextPage}
          onMemberCommand={command.startMember}
          onRetry={ownerManagedMemberships.retry}
          onStatusChange={ownerManagedMemberships.setStatus}
          pendingCommand={command.pending}
          selfMembershipId={selfMembership.membership?.membershipId ?? null}
          status={ownerManagedMemberships.status}
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
        <DetailRow
          label="방장"
          value={room.ownerMembershipId === room.myMembership?.membershipId ? "나" : "참여자"}
        />
        <DetailRow label="생성 시각" value={formatDateTime(room.createdAt)} />
        {room.closedAt ? (
          <DetailRow label="종료 시각" value={formatDateTime(room.closedAt)} />
        ) : null}
      </dl>
    </article>
  );
}

function MyMembershipCard({
  errorMessage,
  isError,
  isFetching,
  membership,
  onRetry,
}: {
  errorMessage: string | null;
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
          <p className="text-xs">{errorMessage}</p>
          <button className="secondary-button mt-3" onClick={onRetry} type="button">
            내 멤버십 다시 불러오기
          </button>
        </div>
      ) : membership ? (
        <dl className="mt-3 grid gap-2 text-sm">
          <DetailRow label="참여자" value="나" />
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

function ActiveMembershipList({
  errorMessage,
  hasNextPage,
  isCommandPending,
  isError,
  isFetchingNextPage,
  isOwner,
  isPending,
  memberships,
  onFetchNextPage,
  onMemberCommand,
  onRetry,
  pendingCommand,
  selfMembershipId,
}: {
  errorMessage: string | null;
  hasNextPage: boolean;
  isCommandPending: boolean;
  isError: boolean;
  isFetchingNextPage: boolean;
  isOwner: boolean;
  isPending: boolean;
  memberships: readonly RoomMembershipListItem[];
  onFetchNextPage: () => void;
  onMemberCommand: (
    kind: ChatRoomMemberCommandKind,
    targetMembershipId: string,
    targetLabel: string,
  ) => void;
  onRetry: () => void;
  pendingCommand: ChatRoomMembershipPendingCommand | null;
  selfMembershipId: string | null;
}) {
  return (
    <div className="mt-6 border-t border-slate-200 pt-5">
      <div>
        <p className="eyebrow">Room participants</p>
        <h3 className="text-lg font-bold text-slate-950">참여자 목록</h3>
      </div>

      {isError ? (
        <div
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-950"
          role="alert"
        >
          <p className="text-sm font-semibold">참여자 목록을 불러오지 못했습니다.</p>
          <p className="mt-1 text-xs opacity-80">{errorMessage}</p>
          <button className="secondary-button mt-3" onClick={onRetry} type="button">
            참여자 목록 다시 불러오기
          </button>
        </div>
      ) : isPending ? (
        <MembershipNotice message="참여자 목록을 불러오고 있습니다." />
      ) : memberships.length === 0 ? (
        <MembershipNotice message="현재 참여 중인 사람이 없습니다." />
      ) : (
        <MembershipRows
          actionMode={isOwner ? "active-owner" : "none"}
          isCommandPending={isCommandPending}
          memberships={memberships}
          onMemberCommand={onMemberCommand}
          pendingCommand={pendingCommand}
          selfMembershipId={selfMembershipId}
        />
      )}

      <MembershipPagination
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onFetchNextPage={onFetchNextPage}
      />
    </div>
  );
}

function OwnerMembershipManagement({
  errorMessage,
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
  selfMembershipId,
  status,
}: {
  errorMessage: string | null;
  hasNextPage: boolean;
  isCommandPending: boolean;
  isError: boolean;
  isFetchingNextPage: boolean;
  isPending: boolean;
  memberships: readonly RoomMembershipListItem[];
  onFetchNextPage: () => void;
  onMemberCommand: (
    kind: ChatRoomMemberCommandKind,
    targetMembershipId: string,
    targetLabel: string,
  ) => void;
  onRetry: () => void;
  onStatusChange: (status: ChatRoomOwnerManagedMembershipStatus) => void;
  pendingCommand: ChatRoomMembershipPendingCommand | null;
  selfMembershipId: string | null;
  status: ChatRoomOwnerManagedMembershipStatus;
}) {
  return (
    <div className="mt-6 border-t border-slate-200 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Owner controls</p>
          <h3 className="text-lg font-bold text-slate-950">비활성 멤버 관리</h3>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="비활성 멤버 상태 필터">
          {(["LEFT", "BANNED"] as const).map((value) => (
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
          <p className="text-sm font-semibold">비활성 멤버 목록을 불러오지 못했습니다.</p>
          <p className="mt-1 text-xs opacity-80">{errorMessage}</p>
          <button className="secondary-button mt-3" onClick={onRetry} type="button">
            비활성 멤버 목록 다시 불러오기
          </button>
        </div>
      ) : isPending ? (
        <MembershipNotice message="비활성 멤버 목록을 불러오고 있습니다." />
      ) : memberships.length === 0 ? (
        <MembershipNotice message={`${MEMBERSHIP_STATUS_LABEL[status]} 상태의 멤버가 없습니다.`} />
      ) : (
        <MembershipRows
          actionMode={status === "BANNED" ? "banned-owner" : "none"}
          isCommandPending={isCommandPending}
          memberships={memberships}
          onMemberCommand={onMemberCommand}
          pendingCommand={pendingCommand}
          selfMembershipId={selfMembershipId}
        />
      )}

      <MembershipPagination
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onFetchNextPage={onFetchNextPage}
      />
    </div>
  );
}

function MembershipRows({
  actionMode,
  isCommandPending,
  memberships,
  onMemberCommand,
  pendingCommand,
  selfMembershipId,
}: {
  actionMode: "active-owner" | "banned-owner" | "none";
  isCommandPending: boolean;
  memberships: readonly RoomMembershipListItem[];
  onMemberCommand: (
    kind: ChatRoomMemberCommandKind,
    targetMembershipId: string,
    targetLabel: string,
  ) => void;
  pendingCommand: ChatRoomMembershipPendingCommand | null;
  selfMembershipId: string | null;
}) {
  return (
    <ul className="mt-4 grid gap-3">
      {memberships.map((member) => (
        <li
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
          key={member.membershipId}
        >
          <ChatRoomParticipantProfile
            displayName={member.displayName}
            imageUrl={member.imageUrl}
            isSelf={member.membershipId === selfMembershipId}
            metadata={MEMBERSHIP_STATUS_LABEL[member.status]}
            role={member.role}
          />
          {actionMode === "active-owner" && member.role === "MEMBER" ? (
            <div className="flex flex-wrap gap-2">
              <button
                className="secondary-button"
                disabled={isCommandPending}
                onClick={() => onMemberCommand("transfer", member.membershipId, member.displayName)}
                type="button"
              >
                {isPendingForMember(pendingCommand, "transfer", member.membershipId)
                  ? "위임 중…"
                  : "방장 위임"}
              </button>
              <button
                className="secondary-button border-red-300 text-red-700"
                disabled={isCommandPending}
                onClick={() => onMemberCommand("ban", member.membershipId, member.displayName)}
                type="button"
              >
                {isPendingForMember(pendingCommand, "ban", member.membershipId)
                  ? "차단 중…"
                  : "차단"}
              </button>
            </div>
          ) : actionMode === "banned-owner" ? (
            <button
              className="secondary-button"
              disabled={isCommandPending}
              onClick={() => onMemberCommand("unban", member.membershipId, member.displayName)}
              type="button"
            >
              {isPendingForMember(pendingCommand, "unban", member.membershipId)
                ? "해제 중…"
                : "차단 해제"}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function MembershipPagination({
  hasNextPage,
  isFetchingNextPage,
  onFetchNextPage,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onFetchNextPage: () => void;
}) {
  return hasNextPage ? (
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
  ) : null;
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
  command: ChatRoomMembershipPendingCommand | null,
  kind: ChatRoomMemberCommandKind,
  targetMembershipId: string,
): boolean {
  return command?.kind === kind && command.targetMembershipId === targetMembershipId;
}

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : DATE_TIME_FORMATTER.format(timestamp);
}
