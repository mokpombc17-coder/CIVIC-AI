import type { RoomReadReceiptPosition, RoomReadReceiptStateResponse } from "./chat-room-contracts";

export type ChatRoomReadReceiptState = Readonly<{
  roomId: string;
  roomVersion: number;
  selfMembershipId: string;
  positionsByMembershipId: Readonly<Record<string, RoomReadReceiptPosition>>;
  generatedAt: string;
}>;

export function normalizeRoomReadReceiptState(
  response: RoomReadReceiptStateResponse,
): ChatRoomReadReceiptState {
  return {
    roomId: response.roomId,
    roomVersion: response.roomVersion,
    selfMembershipId: response.selfMembershipId,
    positionsByMembershipId: Object.fromEntries(
      response.positions.map((position) => [position.membershipId, position]),
    ),
    generatedAt: response.generatedAt,
  };
}
