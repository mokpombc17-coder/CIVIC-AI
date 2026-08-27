"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { selectRetryableChatCommand } from "@/lib/chat/chat-command-retry";
import { resolveRoomMembershipListPolicy } from "@/lib/chat/chat-room-membership-list-policy";
import { ROOM_PARTICIPANT_PROFILE_PAGE_LIMIT } from "@/lib/chat/chat-room-participant-profiles";
import type {
  RoomDetails,
  RoomMembership,
  RoomMembershipListItem,
  TargetMembershipRequest,
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

export type ChatRoomManagementCommandKind = "leave" | "close" | "transfer" | "ban" | "unban";
export type ChatRoomMemberCommandKind = Extract<
  ChatRoomManagementCommandKind,
  "transfer" | "ban" | "unban"
>;
export type ChatRoomMembershipPendingCommand =
  | Readonly<{
      kind: "leave" | "close";
    }>
  | Readonly<{
      kind: ChatRoomMemberCommandKind;
      targetMembershipId: string;
    }>;

type RoomManagementCommand =
  | Readonly<{
      kind: "leave" | "close";
      command: IdempotentCommand<undefined>;
    }>
  | Readonly<{
      kind: ChatRoomMemberCommandKind;
      command: IdempotentCommand<TargetMembershipRequest>;
      targetMembershipId: string;
    }>;

type MembershipListController = Readonly<{
  errorMessage: string | null;
  hasNextPage: boolean;
  isError: boolean;
  isFetchingNextPage: boolean;
  isPending: boolean;
  memberships: readonly RoomMembershipListItem[];
  fetchNextPage: () => void;
  retry: () => void;
}>;

export type ChatRoomMembershipPanelController = Readonly<{
  activeMemberships: MembershipListController;
  command: Readonly<{
    error: Readonly<{
      canRetry: boolean;
      message: string;
      title: string;
    }> | null;
    isPending: boolean;
    pending: ChatRoomMembershipPendingCommand | null;
    retry: () => void;
    startMember: (
      kind: ChatRoomMemberCommandKind,
      targetMembershipId: string,
      targetLabel: string,
    ) => void;
    startRoom: (kind: "leave" | "close") => void;
    successMessage: string | null;
  }>;
  isActiveMembershipListEnabled: boolean;
  isOwner: boolean;
  ownerManagedMemberships: MembershipListController;
  roomActionKind: "leave" | "close" | null;
  selfMembership: Readonly<{
    errorMessage: string | null;
    isError: boolean;
    isFetching: boolean;
    membership: RoomMembership | null;
    retry: () => void;
  }>;
}>;

const COMMAND_LABEL: Record<ChatRoomManagementCommandKind, string> = {
  leave: "방 나가기",
  close: "방 종료",
  transfer: "방장 위임",
  ban: "멤버 차단",
  unban: "차단 해제",
};

const COMMAND_SUCCESS_MESSAGE: Record<ChatRoomManagementCommandKind, string> = {
  leave: "채팅방에서 나갔습니다.",
  close: "채팅방을 종료했습니다.",
  transfer: "방장을 위임했습니다.",
  ban: "멤버를 차단했습니다.",
  unban: "멤버의 차단을 해제했습니다.",
};

export function useChatRoomMembershipPanel(
  room: RoomDetails,
  roomId: string,
): ChatRoomMembershipPanelController {
  const router = useRouter();
  const [pendingCommand, setPendingCommand] = useState<RoomManagementCommand | null>(null);
  const [failedCommand, setFailedCommand] = useState<RoomManagementCommand | null>(null);
  const [commandError, setCommandError] = useState<unknown>(null);
  const [commandSuccess, setCommandSuccess] = useState<string | null>(null);
  const membershipQuery = useMyRoomMembershipQuery(roomId, {
    enabled: room.myMembership !== null,
  });
  const membership = membershipQuery.data ?? room.myMembership;
  const membershipListPolicy = resolveRoomMembershipListPolicy(room, membership, "ACTIVE");
  const isOwner = membershipListPolicy.isOwner;
  const activeMembershipsQuery = useRoomMembershipsQuery(roomId, {
    enabled: membershipListPolicy.enabled,
    limit: ROOM_PARTICIPANT_PROFILE_PAGE_LIMIT,
    status: "ACTIVE",
  });
  const ownerManagedMembershipsQuery = useRoomMembershipsQuery(roomId, {
    enabled: isOwner,
    status: "BANNED",
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
          await leaveRoom.mutateAsync({ roomId, command: command.command });
          break;
        case "close":
          await closeRoom.mutateAsync({ roomId, command: command.command });
          break;
        case "transfer":
          await transferOwnership.mutateAsync({ roomId, command: command.command });
          break;
        case "ban":
          await banMember.mutateAsync({ roomId, command: command.command });
          break;
        case "unban":
          await unbanMember.mutateAsync({ roomId, command: command.command });
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

    void execute({ kind, command: createIdempotentCommand(undefined) });
  }

  function startMemberCommand(
    kind: ChatRoomMemberCommandKind,
    targetMembershipId: string,
    targetLabel: string,
  ) {
    const prompt =
      kind === "transfer"
        ? `${targetLabel}에게 방장을 위임할까요?`
        : kind === "ban"
          ? `${targetLabel}를 이 방에서 차단할까요?`
          : `${targetLabel}의 차단을 해제할까요?`;

    if (!window.confirm(prompt)) {
      return;
    }

    void execute({
      kind,
      targetMembershipId,
      command: createIdempotentCommand({ targetMembershipId }),
    });
  }

  const retryCommand = selectRetryableChatCommand(failedCommand, commandError);
  const commandErrorPresentation =
    commandError === null
      ? null
      : {
          canRetry: retryCommand !== null,
          message: toErrorMessage(commandError),
          title: failedCommand
            ? `${COMMAND_LABEL[failedCommand.kind]}에 실패했습니다.`
            : "요청에 실패했습니다.",
        };
  const pendingCommandPresentation = toPendingCommand(pendingCommand);
  const roomActionKind =
    room.status === "ACTIVE" && membership?.status === "ACTIVE"
      ? membership.role === "MEMBER"
        ? "leave"
        : "close"
      : null;

  return {
    activeMemberships: {
      errorMessage: activeMembershipsQuery.isError
        ? toErrorMessage(activeMembershipsQuery.error)
        : null,
      fetchNextPage: () => void activeMembershipsQuery.fetchNextPage(),
      hasNextPage: activeMembershipsQuery.hasNextPage,
      isError: activeMembershipsQuery.isError,
      isFetchingNextPage: activeMembershipsQuery.isFetchingNextPage,
      isPending: activeMembershipsQuery.isPending,
      memberships: activeMembershipsQuery.memberships,
      retry: () => void activeMembershipsQuery.refetch(),
    },
    command: {
      error: commandErrorPresentation,
      isPending: pendingCommand !== null,
      pending: pendingCommandPresentation,
      retry: () => {
        if (retryCommand) {
          void execute(retryCommand);
        }
      },
      startMember: startMemberCommand,
      startRoom: startRoomCommand,
      successMessage: commandSuccess,
    },
    isActiveMembershipListEnabled: membershipListPolicy.enabled,
    isOwner,
    ownerManagedMemberships: {
      errorMessage: ownerManagedMembershipsQuery.isError
        ? toErrorMessage(ownerManagedMembershipsQuery.error)
        : null,
      fetchNextPage: () => void ownerManagedMembershipsQuery.fetchNextPage(),
      hasNextPage: ownerManagedMembershipsQuery.hasNextPage,
      isError: ownerManagedMembershipsQuery.isError,
      isFetchingNextPage: ownerManagedMembershipsQuery.isFetchingNextPage,
      isPending: ownerManagedMembershipsQuery.isPending,
      memberships: ownerManagedMembershipsQuery.memberships,
      retry: () => void ownerManagedMembershipsQuery.refetch(),
    },
    roomActionKind,
    selfMembership: {
      errorMessage: membershipQuery.isError ? toErrorMessage(membershipQuery.error) : null,
      isError: membershipQuery.isError,
      isFetching: membershipQuery.isFetching,
      membership,
      retry: () => void membershipQuery.refetch(),
    },
  };
}

function toPendingCommand(
  command: RoomManagementCommand | null,
): ChatRoomMembershipPendingCommand | null {
  if (command === null) {
    return null;
  }

  return "targetMembershipId" in command
    ? { kind: command.kind, targetMembershipId: command.targetMembershipId }
    : { kind: command.kind };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
