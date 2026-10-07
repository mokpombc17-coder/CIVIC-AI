import type { RoomMembershipListItem, RoomParticipationListItem } from "./chat-room-contracts";

export const ROOM_PARTICIPANT_PROFILE_PAGE_LIMIT = 100;
export const UNKNOWN_ROOM_PARTICIPANT_DISPLAY_NAME = "알 수 없음";

export function getRoomParticipantDisplayName(
  membership: Pick<RoomMembershipListItem, "displayName" | "userLabel">,
): string {
  return membership.userLabel ?? membership.displayName;
}

export function createRoomParticipantDisplayNames(
  memberships: readonly RoomMembershipListItem[],
): ReadonlyMap<string, string> {
  return new Map(
    memberships.map((membership) => [
      membership.membershipId,
      getRoomParticipantDisplayName(membership),
    ]),
  );
}

export function createRoomParticipationDisplayNames(
  participations: readonly RoomParticipationListItem[],
): ReadonlyMap<string, string> {
  return new Map(
    participations.map((participation) => [
      participation.participationId,
      participation.displayName,
    ]),
  );
}
