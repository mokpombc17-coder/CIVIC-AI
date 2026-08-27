"use client";

import type { ReactNode } from "react";
import { ChatRoomCategoryBadges } from "@/components/chat-room-category-badges";
import { ChatRoomParticipantProfile } from "@/components/chat-room-participant-profile";
import { ChatRoomSettingsControl } from "@/components/chat-room-settings-control";
import {
  useChatRoomMembershipPanel,
  type ChatRoomMemberCommandKind,
  type ChatRoomMembershipPanelController,
  type ChatRoomMembershipPendingCommand,
} from "@/components/use-chat-room-membership-panel";
import type {
  MembershipStatus,
  RoomDetails,
  RoomMembershipListItem,
} from "@/lib/chat/chat-room-contracts";

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
        <h2 id={headingId}>채팅방 메뉴</h2>
        <div className="flex flex-wrap items-center justify-end gap-2">{headerAction}</div>
      </div>

      <RoomSummary room={room} />
      {isOwner ? <ChatRoomSettingsControl room={room} /> : null}

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
        <BlockedMembershipManagement
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
          pendingCommand={command.pending}
          selfMembershipId={selfMembership.membership?.membershipId ?? null}
        />
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

      {roomActionKind ? (
        <div className="mt-6 border-t border-slate-200 pt-5">
          {roomActionKind === "leave" ? (
            <button
              className="secondary-button w-full"
              disabled={command.isPending}
              onClick={() => command.startRoom("leave")}
              type="button"
            >
              {command.pending?.kind === "leave" ? "나가는 중…" : "방 나가기"}
            </button>
          ) : (
            <button
              className="secondary-button w-full border-red-300 text-red-700"
              disabled={command.isPending}
              onClick={() => command.startRoom("close")}
              type="button"
            >
              {command.pending?.kind === "close" ? "종료 중…" : "방 종료"}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}

function RoomSummary({ room }: { room: RoomDetails }) {
  return (
    <div className="mt-4 grid gap-3 rounded-xl bg-[var(--chat-publishing-color-neutral-soft)] p-4">
      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
        {room.description || "채팅방 소개가 없습니다."}
      </p>
      <ChatRoomCategoryBadges categories={room.categories} />
    </div>
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
      <h3 className="text-lg font-bold text-slate-950">참여자 목록</h3>

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

function BlockedMembershipManagement({
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
  pendingCommand,
  selfMembershipId,
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
  pendingCommand: ChatRoomMembershipPendingCommand | null;
  selfMembershipId: string | null;
}) {
  return (
    <div className="mt-6 border-t border-slate-200 pt-5">
      <h3 className="text-lg font-bold text-slate-950">차단된 사용자 관리</h3>

      {isError ? (
        <div
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-950"
          role="alert"
        >
          <p className="text-sm font-semibold">차단된 사용자 목록을 불러오지 못했습니다.</p>
          <p className="mt-1 text-xs opacity-80">{errorMessage}</p>
          <button className="secondary-button mt-3" onClick={onRetry} type="button">
            차단된 사용자 목록 다시 불러오기
          </button>
        </div>
      ) : isPending ? (
        <MembershipNotice message="차단된 사용자 목록을 불러오고 있습니다." />
      ) : memberships.length === 0 ? (
        <MembershipNotice message="차단된 사용자가 없습니다." />
      ) : (
        <MembershipRows
          actionMode="banned-owner"
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
