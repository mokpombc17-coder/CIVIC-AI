import type { RoomMembershipListItem } from "./chat-room-contracts";

export const ROOM_PARTICIPANT_PROFILE_PAGE_LIMIT = 100;
export const UNKNOWN_ROOM_PARTICIPANT_DISPLAY_NAME = "알 수 없음";

export function createRoomParticipantDisplayNames(
  memberships: readonly RoomMembershipListItem[],
): ReadonlyMap<string, string> {
  return new Map(
    memberships.map((membership) => [
      membership.membershipId,
      membership.userLabel ?? membership.displayName,
    ]),
  );
}
