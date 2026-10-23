"use client";

import { useId, type ReactNode } from "react";
import { ChatRoomParticipantProfile } from "@/components/chat/chat-room-participant-profile";
import { ChatRoomInformationSection } from "@/components/chat/chat-room-settings-control";
import {
  useChatRoomMembershipPanel,
  type ChatRoomMemberCommandKind,
  type ChatRoomMembershipPanelController,
  type ChatRoomMembershipPendingCommand,
} from "@/components/chat/use-chat-room-membership-panel";
import type {
  MembershipStatus,
  RoomDetails,
  RoomMembershipListItem,
} from "@/lib/chat/chat-room-contracts";
import { getRoomParticipantDisplayName } from "@/lib/chat/chat-room-participant-profiles";

const MEMBERSHIP_STATUS_LABEL: Record<MembershipStatus, string> = {
  ACTIVE: "참여 중",
  LEFT: "나감",
  BANNED: "차단됨",
};

const PANEL_SECONDARY_BUTTON_CLASS_NAME =
  "inline-flex min-h-11 items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-border)] bg-white px-4 text-sm font-bold text-[var(--chat-publishing-color-text)] transition hover:bg-[var(--chat-publishing-color-neutral-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)] disabled:cursor-not-allowed disabled:opacity-50";
const MEMBER_ACTION_BUTTON_CLASS_NAME =
  "inline-flex min-h-9 items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-border)] bg-white px-3 text-xs font-bold text-[var(--chat-publishing-color-text)] transition hover:bg-[var(--chat-publishing-color-neutral-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)] disabled:cursor-not-allowed disabled:opacity-50";

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
    roomActionDisabledReason,
    roomActionKind,
    selfMembership,
  } = controller;
  const roomActionDisabledReasonId = useId();

  return (
    <section className="px-5 pb-6">
      <div
        className="sticky top-0 z-20 -mx-5 flex min-h-14 items-start justify-between gap-4 border-b border-[var(--chat-publishing-color-border)] bg-white px-5 py-2"
        data-chat-room-membership-header="true"
      >
        <h2 className="min-w-0 pt-2 text-xl font-semibold leading-7" id={headingId}>
          토론방 메뉴
        </h2>
        <div className="flex flex-wrap items-center justify-end gap-2">{headerAction}</div>
      </div>

      <ChatRoomInformationSection canEdit={isOwner} room={room} />

      {isActiveMembershipListEnabled || isOwner ? (
        <div className="border-t border-[var(--chat-publishing-color-border)] py-5">
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
              totalCount={room.activeMemberCount}
            />
          ) : null}

          {isOwner ? (
            <div className={isActiveMembershipListEnabled ? "mt-5" : undefined}>
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
            </div>
          ) : null}
        </div>
      ) : null}

      {command.error ? (
        <div
          className="mt-4 rounded-[var(--chat-publishing-radius-card)] border border-[#ffc95c] bg-[#fff7e8] p-4 text-[var(--chat-publishing-color-text)]"
          role="alert"
        >
          <p className="text-sm font-semibold">{command.error.title}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--chat-publishing-color-muted)]">
            {command.error.message}
          </p>
          {command.error.canRetry ? (
            <button
              className={`${PANEL_SECONDARY_BUTTON_CLASS_NAME} mt-3`}
              disabled={command.isPending}
              onClick={command.retry}
              type="button"
            >
              같은 요청으로 다시 시도
            </button>
          ) : null}
        </div>
      ) : null}

      {/* 성공은 참여자·차단 목록이 바뀌는 것으로 화면에 드러나므로 안내는 화면 낭독기에만 읽어 줌
          알림 영역이 새로 생기면 화면 낭독기가 내용을 놓칠 수 있어 영역은 항상 두고 문구만 바꿈 */}
      <p className="sr-only" role="status">
        {command.successMessage ?? ""}
      </p>

      {roomActionKind ? (
        <div className="mt-5 border-t border-[var(--chat-publishing-color-border)] pt-5">
          <button
            aria-describedby={roomActionDisabledReason ? roomActionDisabledReasonId : undefined}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--chat-publishing-radius-control)] px-4 text-sm font-semibold text-[#b42318] transition hover:bg-[#fff1f0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b42318] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={command.isPending || roomActionDisabledReason !== null}
            onClick={() => command.startRoom(roomActionKind)}
            type="button"
          >
            {roomActionKind === "leave"
              ? command.pending?.kind === "leave"
                ? "나가는 중…"
                : "방 나가기"
              : command.pending?.kind === "close"
                ? "종료 중…"
                : "방 종료"}
          </button>
          {roomActionDisabledReason ? (
            <p
              className="mt-2 text-center text-[13px] leading-5 text-[var(--chat-publishing-color-muted)]"
              id={roomActionDisabledReasonId}
            >
              {roomActionDisabledReason}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
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
  totalCount,
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
  totalCount: number;
}) {
  return (
    <section>
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold text-[var(--chat-publishing-color-text)]">참여자</h3>
        <span className="text-sm text-[var(--chat-publishing-color-muted)]">{totalCount}명</span>
      </div>

      {isError ? (
        <div
          className="mt-3 rounded-[var(--chat-publishing-radius-card)] border border-[#ffc95c] bg-[#fff7e8] p-4 text-[var(--chat-publishing-color-text)]"
          role="alert"
        >
          <p className="text-sm font-semibold">참여자 목록을 불러오지 못했습니다.</p>
          <p className="mt-1 text-xs leading-5 text-[var(--chat-publishing-color-muted)]">
            {errorMessage}
          </p>
          <button
            className={`${PANEL_SECONDARY_BUTTON_CLASS_NAME} mt-3`}
            onClick={onRetry}
            type="button"
          >
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
    </section>
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
    <section>
      <h3 className="text-base font-semibold text-[var(--chat-publishing-color-text)]">
        차단된 사용자 관리
      </h3>

      <div className="pb-5">
        {isError ? (
          <div
            className="mt-2 rounded-[var(--chat-publishing-radius-card)] border border-[#ffc95c] bg-[#fff7e8] p-4 text-[var(--chat-publishing-color-text)]"
            role="alert"
          >
            <p className="text-sm font-semibold">차단된 사용자 목록을 불러오지 못했습니다.</p>
            <p className="mt-1 text-xs leading-5 text-[var(--chat-publishing-color-muted)]">
              {errorMessage}
            </p>
            <button
              className={`${PANEL_SECONDARY_BUTTON_CLASS_NAME} mt-3`}
              onClick={onRetry}
              type="button"
            >
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
    </section>
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
    <ul className="mt-2 min-w-0 max-w-full">
      {memberships.map((member) => (
        <li
          className="flex min-w-0 max-w-full items-center justify-between gap-3 py-3"
          key={member.membershipId}
        >
          <ChatRoomParticipantProfile
            displayName={getRoomParticipantDisplayName(member)}
            imageUrl={member.imageUrl}
            isSelf={member.membershipId === selfMembershipId}
            metadata={MEMBERSHIP_STATUS_LABEL[member.status]}
            role={member.role}
          />
          {actionMode === "active-owner" && member.role === "MEMBER" ? (
            <details className="group relative shrink-0">
              <summary
                aria-label={`${getRoomParticipantDisplayName(member)} 관리`}
                className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full text-[var(--chat-publishing-color-muted)] transition hover:bg-[var(--chat-publishing-color-neutral-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)] [&::-webkit-details-marker]:hidden"
              >
                <svg aria-hidden="true" className="size-5" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="5" cy="12" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="19" cy="12" r="1.5" />
                </svg>
              </summary>
              <div className="absolute right-0 z-10 mt-1 grid min-w-32 overflow-hidden rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-border)] bg-white p-1 shadow-[0_8px_24px_rgba(18,20,23,0.14)]">
                <button
                  className="min-h-10 rounded-[calc(var(--chat-publishing-radius-control)-2px)] px-3 text-left text-sm font-semibold text-[var(--chat-publishing-color-text)] hover:bg-[var(--chat-publishing-color-neutral-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isCommandPending}
                  onClick={() =>
                    onMemberCommand(
                      "transfer",
                      member.membershipId,
                      getRoomParticipantDisplayName(member),
                    )
                  }
                  type="button"
                >
                  {isPendingForMember(pendingCommand, "transfer", member.membershipId)
                    ? "위임 중…"
                    : "방장 위임"}
                </button>
                <button
                  className="min-h-10 rounded-[calc(var(--chat-publishing-radius-control)-2px)] px-3 text-left text-sm font-semibold text-[#b42318] hover:bg-[#fff1f0] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isCommandPending}
                  onClick={() =>
                    onMemberCommand(
                      "ban",
                      member.membershipId,
                      getRoomParticipantDisplayName(member),
                    )
                  }
                  type="button"
                >
                  {isPendingForMember(pendingCommand, "ban", member.membershipId)
                    ? "차단 중…"
                    : "차단"}
                </button>
              </div>
            </details>
          ) : actionMode === "banned-owner" ? (
            <button
              className={MEMBER_ACTION_BUTTON_CLASS_NAME}
              disabled={isCommandPending}
              onClick={() =>
                onMemberCommand("unban", member.membershipId, getRoomParticipantDisplayName(member))
              }
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
        className={PANEL_SECONDARY_BUTTON_CLASS_NAME}
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
    <div className="mt-3 rounded-[var(--chat-publishing-radius-card)] bg-[var(--chat-publishing-color-neutral-soft)] px-5 py-6 text-center">
      <p className="text-sm leading-6 text-[var(--chat-publishing-color-muted)]">{message}</p>
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
