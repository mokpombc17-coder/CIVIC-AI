import type { MembershipRole, MembershipStatus, RoomStatus } from "./chat-room-contracts";

type RoomMembershipListRoom = Readonly<{
  ownerMembershipId: string;
  status: RoomStatus;
}>;

type CurrentRoomMembership = Readonly<{
  membershipId: string;
  role: MembershipRole;
  status: MembershipStatus;
}> | null;

export type RoomMembershipListPolicy = Readonly<{
  enabled: boolean;
  isOwner: boolean;
  status: MembershipStatus;
}>;

export function resolveRoomMembershipListPolicy(
  room: RoomMembershipListRoom,
  membership: CurrentRoomMembership,
  requestedStatus: MembershipStatus,
): RoomMembershipListPolicy {
  const isActiveMember = room.status === "ACTIVE" && membership?.status === "ACTIVE";
  const isOwner =
    isActiveMember &&
    membership.role === "OWNER" &&
    membership.membershipId === room.ownerMembershipId;

  return {
    enabled: isActiveMember,
    isOwner,
    status: isOwner ? requestedStatus : "ACTIVE",
  };
}
