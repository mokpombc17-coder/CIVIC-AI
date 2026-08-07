import type { RoomMembership } from "./chat-room-contracts";
import type { ChatRoomReadStateMembershipLifecycle } from "./chat-room-read-state-coordinator";

export function getChatRoomReadStateMembershipLifecycle({
  enabled,
  membership,
  messageVisibleAfterSequence,
}: Readonly<{
  enabled: boolean;
  membership: Pick<RoomMembership, "status" | "userId" | "version"> | null;
  messageVisibleAfterSequence: number | null;
}>): ChatRoomReadStateMembershipLifecycle | null {
  if (!enabled || membership?.status !== "ACTIVE" || messageVisibleAfterSequence === null) {
    return null;
  }

  return Object.freeze({
    membershipVersion: membership.version,
    messageVisibleAfterSequence,
    userId: membership.userId,
  });
}
