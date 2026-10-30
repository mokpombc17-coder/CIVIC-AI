import type { QueryClient } from "@tanstack/react-query";
import {
  refreshAuthoritativeRoomQueries,
  resetRoomMembershipQueries,
} from "../chat-room-cache-effects";
import type { RoomDetails, RoomMembership } from "../chat-room-contracts";
import { chatRoomQueryKeys } from "../chat-room-queries";
import type { ChatRoomEventEnvelope, ChatRoomEventMemberState } from "./chat-stomp-contracts";

export type ChatRoomEventCacheProjection = Readonly<{
  eventsApplied: number;
  myMembership: RoomMembership | undefined;
  requiresMembershipRefetch: boolean;
  requiresRoomDetailRefetch: boolean;
  roomDetails: RoomDetails | undefined;
  roomId: string;
}>;

type ChatRoomEventCacheRefreshErrorHandler = (error: unknown) => void;

const MEMBERSHIP_TOPOLOGY_EVENT_TYPES = new Set<ChatRoomEventEnvelope["eventType"]>([
  "ROOM_MEMBER_JOINED",
  "ROOM_MEMBER_REJOINED",
  "ROOM_MEMBER_LEFT",
  "ROOM_MEMBER_BANNED",
  "ROOM_CLOSED",
]);

export function createChatRoomEventCacheProjection(
  queryClient: QueryClient,
  roomId: string,
  events: readonly ChatRoomEventEnvelope[],
): ChatRoomEventCacheProjection {
  const roomDetails = queryClient.getQueryData<RoomDetails>(chatRoomQueryKeys.detail(roomId));
  const myMembership = queryClient.getQueryData<RoomMembership>(
    chatRoomQueryKeys.myMembership(roomId),
  );
  const currentMembershipId = myMembership?.membershipId ?? roomDetails?.myMembership?.membershipId;
  let nextRoomDetails = roomDetails;
  let nextMyMembership = myMembership;
  let eventsApplied = 0;
  let requiresMembershipRefetch = false;
  let requiresRoomDetailRefetch = false;

  for (const event of events) {
    if (event.payload.roomId !== roomId) {
      continue;
    }

    if (MEMBERSHIP_TOPOLOGY_EVENT_TYPES.has(event.eventType)) {
      requiresMembershipRefetch = true;
    }

    if (!nextRoomDetails) {
      requiresRoomDetailRefetch = true;
      continue;
    }

    if (event.payload.roomVersion <= nextRoomDetails.version) {
      continue;
    }

    if (event.payload.roomVersion > nextRoomDetails.version + 1) {
      requiresRoomDetailRefetch = true;
      continue;
    }

    const currentUserState = currentMembershipId
      ? getEventMemberStates(event).find((state) => state.membershipId === currentMembershipId)
      : undefined;

    if (nextMyMembership && currentUserState) {
      nextMyMembership = projectMembership(nextMyMembership, currentUserState);
    }

    nextRoomDetails = projectRoomDetails(nextRoomDetails, event, currentUserState);
    eventsApplied += 1;
  }

  return {
    eventsApplied,
    myMembership: nextMyMembership,
    requiresMembershipRefetch,
    requiresRoomDetailRefetch,
    roomDetails: nextRoomDetails,
    roomId,
  };
}

export function applyChatRoomEventCacheProjection(
  queryClient: QueryClient,
  projection: ChatRoomEventCacheProjection,
  onRefreshError?: ChatRoomEventCacheRefreshErrorHandler,
): void {
  const requiresAuthoritativeRoomRefetch =
    projection.eventsApplied > 0 || projection.requiresRoomDetailRefetch;

  if (!requiresAuthoritativeRoomRefetch && !projection.requiresMembershipRefetch) {
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

  const refreshPromise = requiresAuthoritativeRoomRefetch
    ? refreshAuthoritativeRoomQueries(queryClient, projection.roomId)
    : resetRoomMembershipQueries(queryClient, projection.roomId);

  void refreshPromise.catch((error: unknown) => {
    onRefreshError?.(error);
  });
}

function projectRoomDetails(
  room: RoomDetails,
  event: ChatRoomEventEnvelope,
  currentUserState: ChatRoomEventMemberState | undefined,
): RoomDetails {
  let nextRoom: RoomDetails = {
    ...room,
    activeMemberCount: projectActiveMemberCount(room, event),
    ownerMembershipId: getOwnerMembershipId(event, room.ownerMembershipId),
    participationStatus:
      event.payload.roomStatus === "CLOSED" ? "ROOM_CLOSED" : room.participationStatus,
    status: event.payload.roomStatus,
    version: event.payload.roomVersion,
    ...(event.eventType === "ROOM_SETTINGS_UPDATED"
      ? {
          name: event.payload.name,
          description: event.payload.description,
          // The event does not include display names. Keep the last coherent HTTP category
          // snapshot until refreshAuthoritativeRoomQueries replaces both category fields.
          visibility: event.payload.visibility,
          joinPolicy: event.payload.joinPolicy,
        }
      : {}),
  };

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
  if (
    state.membershipId !== membership.membershipId ||
    state.membershipVersion <= membership.version
  ) {
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

function projectActiveMemberCount(room: RoomDetails, event: ChatRoomEventEnvelope): number {
  if (event.eventType === "ROOM_CREATED") {
    return 1;
  }

  if (event.eventType === "ROOM_CLOSED") {
    return 0;
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

function getOwnerMembershipId(
  event: ChatRoomEventEnvelope,
  currentOwnerMembershipId: string,
): string {
  switch (event.eventType) {
    case "ROOM_CREATED":
    case "ROOM_CLOSED":
      return event.payload.owner.membershipId;
    case "ROOM_OWNERSHIP_TRANSFERRED":
      return event.payload.newOwner.membershipId;
    default:
      return currentOwnerMembershipId;
  }
}

function getEventMemberStates(event: ChatRoomEventEnvelope): readonly ChatRoomEventMemberState[] {
  switch (event.eventType) {
    case "ROOM_CREATED":
    case "ROOM_CLOSED":
      return [event.payload.owner];
    case "ROOM_OWNERSHIP_TRANSFERRED":
      return [event.payload.previousOwner, event.payload.newOwner];
    case "ROOM_SETTINGS_UPDATED":
      return [];
    default:
      return [event.payload.member];
  }
}

function toParticipationStatus(
  status: ChatRoomEventMemberState["status"],
): RoomDetails["participationStatus"] {
  return status;
}
