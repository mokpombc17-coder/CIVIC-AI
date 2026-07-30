import type { QueryClient } from "@tanstack/react-query";
import type { RoomDetails, RoomMembership } from "../chat-room-contracts";
import { chatRoomQueryKeys } from "../chat-room-queries";
import type { ChatRoomEventEnvelope, ChatRoomEventMemberState } from "./chat-stomp-contracts";

export type ChatRoomEventCacheProjection = Readonly<{
  eventsApplied: number;
  myMembership: RoomMembership | undefined;
  roomDetails: RoomDetails | undefined;
  roomId: string;
}>;

export function createChatRoomEventCacheProjection(
  queryClient: QueryClient,
  roomId: string,
  events: readonly ChatRoomEventEnvelope[],
): ChatRoomEventCacheProjection {
  const roomDetails = queryClient.getQueryData<RoomDetails>(chatRoomQueryKeys.detail(roomId));
  const myMembership = queryClient.getQueryData<RoomMembership>(
    chatRoomQueryKeys.myMembership(roomId),
  );
  const currentUserId = myMembership?.userId ?? roomDetails?.myMembership?.userId;
  let nextRoomDetails = roomDetails;
  let nextMyMembership = myMembership;

  for (const event of events) {
    if (event.payload.roomId !== roomId) {
      continue;
    }

    const currentUserState = currentUserId
      ? getEventMemberStates(event).find((state) => state.userId === currentUserId)
      : undefined;

    if (nextMyMembership && currentUserState) {
      nextMyMembership = projectMembership(nextMyMembership, currentUserState);
    }

    if (nextRoomDetails) {
      nextRoomDetails = projectRoomDetails(nextRoomDetails, event, currentUserState);
    }
  }

  return {
    eventsApplied: events.length,
    myMembership: nextMyMembership,
    roomDetails: nextRoomDetails,
    roomId,
  };
}

export function applyChatRoomEventCacheProjection(
  queryClient: QueryClient,
  projection: ChatRoomEventCacheProjection,
): void {
  if (projection.eventsApplied === 0) {
    return;
  }

  if (projection.roomDetails) {
    queryClient.setQueryData(chatRoomQueryKeys.detail(projection.roomId), projection.roomDetails);
  }

  if (projection.myMembership) {
    queryClient.setQueryData(
      chatRoomQueryKeys.myMembership(projection.roomId),
      projection.myMembership,
    );
  }

  void refreshAuthoritativeRoomQueries(queryClient, projection.roomId).catch(() => undefined);
}

function projectRoomDetails(
  room: RoomDetails,
  event: ChatRoomEventEnvelope,
  currentUserState: ChatRoomEventMemberState | undefined,
): RoomDetails {
  let nextRoom = room;

  if (event.payload.roomVersion > room.version) {
    const isContiguous = event.payload.roomVersion === room.version + 1;
    const activeMemberCount = projectActiveMemberCount(room, event, isContiguous);

    nextRoom = {
      ...room,
      activeMemberCount,
      ownerUserId: getOwnerUserId(event, room.ownerUserId),
      participationStatus:
        event.payload.roomStatus === "CLOSED" ? "ROOM_CLOSED" : room.participationStatus,
      status: event.payload.roomStatus,
      version: event.payload.roomVersion,
    };
  }

  if (
    currentUserState &&
    nextRoom.myMembership &&
    currentUserState.membershipVersion > nextRoom.myMembership.version
  ) {
    const nextMembership = projectMembership(nextRoom.myMembership, currentUserState);

    nextRoom = {
      ...nextRoom,
      myMembership: nextMembership,
      participationStatus:
        nextRoom.status === "CLOSED" ? "ROOM_CLOSED" : toParticipationStatus(nextMembership.status),
    };
  }

  return nextRoom;
}

function projectMembership(
  membership: RoomMembership,
  state: ChatRoomEventMemberState,
): RoomMembership {
  if (state.userId !== membership.userId || state.membershipVersion <= membership.version) {
    return membership;
  }

  return {
    ...membership,
    membershipId: state.membershipId,
    role: state.role,
    status: state.status,
    version: state.membershipVersion,
  };
}

function projectActiveMemberCount(
  room: RoomDetails,
  event: ChatRoomEventEnvelope,
  isContiguous: boolean,
): number {
  if (event.eventType === "ROOM_CREATED") {
    return 1;
  }

  if (event.eventType === "ROOM_CLOSED") {
    return 0;
  }

  if (!isContiguous) {
    return room.activeMemberCount;
  }

  switch (event.eventType) {
    case "ROOM_MEMBER_JOINED":
    case "ROOM_MEMBER_REJOINED":
      return room.activeMemberCount + 1;
    case "ROOM_MEMBER_LEFT":
    case "ROOM_MEMBER_BANNED":
      return Math.max(0, room.activeMemberCount - 1);
    default:
      return room.activeMemberCount;
  }
}

function getOwnerUserId(event: ChatRoomEventEnvelope, currentOwnerUserId: string): string {
  switch (event.eventType) {
    case "ROOM_CREATED":
    case "ROOM_CLOSED":
      return event.payload.owner.userId;
    case "ROOM_OWNERSHIP_TRANSFERRED":
      return event.payload.newOwner.userId;
    default:
      return currentOwnerUserId;
  }
}

function getEventMemberStates(event: ChatRoomEventEnvelope): readonly ChatRoomEventMemberState[] {
  switch (event.eventType) {
    case "ROOM_CREATED":
    case "ROOM_CLOSED":
      return [event.payload.owner];
    case "ROOM_OWNERSHIP_TRANSFERRED":
      return [event.payload.previousOwner, event.payload.newOwner];
    default:
      return [event.payload.member];
  }
}

function toParticipationStatus(
  status: ChatRoomEventMemberState["status"],
): RoomDetails["participationStatus"] {
  return status;
}

async function refreshAuthoritativeRoomQueries(
  queryClient: QueryClient,
  roomId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: chatRoomQueryKeys.detail(roomId),
    }),
    queryClient.invalidateQueries({
      queryKey: chatRoomQueryKeys.myMembership(roomId),
    }),
    queryClient.invalidateQueries({
      queryKey: chatRoomQueryKeys.membershipLists(roomId),
    }),
    queryClient.invalidateQueries({
      queryKey: chatRoomQueryKeys.publicLists(),
    }),
    queryClient.invalidateQueries({
      queryKey: chatRoomQueryKeys.myLists(),
    }),
  ]);
}
