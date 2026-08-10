import type { ChatRoomReadReceiptState } from "./chat-room-read-receipt-state";

type ChatRoomEntryReadPositionBase = Readonly<{
  entryReadThroughSequence: number;
  generation: number;
  messageVisibleAfterSequence: number;
  roomId: string;
  storedLastReadSequence: number;
}>;

export type ChatRoomEntryReadPositionUnavailableReason =
  | "RECEIPT_NOT_READY"
  | "RECEIPT_STATE_MISSING"
  | "ROOM_MISMATCH"
  | "SELF_MEMBERSHIP_MISMATCH"
  | "SELF_POSITION_MISSING";

export type ChatRoomEntryReadPositionSnapshot =
  | Readonly<{
      generation: number;
      mode: "unavailable";
      reason: ChatRoomEntryReadPositionUnavailableReason;
      roomId: string;
    }>
  | (ChatRoomEntryReadPositionBase &
      Readonly<{
        mode: "latest";
      }>)
  | (ChatRoomEntryReadPositionBase &
      Readonly<{
        dividerAfterSequence: number;
        mode: "restore";
      }>)
  | (ChatRoomEntryReadPositionBase &
      Readonly<{
        mode: "visibility-boundary";
      }>);

export type ResolveChatRoomEntryReadPositionInput = Readonly<{
  generation: number;
  latestConfirmedSequence: number | null;
  receiptState: ChatRoomReadReceiptState | undefined;
  receiptStateReady: boolean;
  roomId: string;
  selfMembershipId: string | null;
}>;

function createUnavailableSnapshot(
  roomId: string,
  generation: number,
  reason: ChatRoomEntryReadPositionUnavailableReason,
): ChatRoomEntryReadPositionSnapshot {
  return Object.freeze({
    generation,
    mode: "unavailable",
    reason,
    roomId,
  });
}

export function resolveChatRoomEntryReadPosition({
  generation,
  latestConfirmedSequence,
  receiptState,
  receiptStateReady,
  roomId,
  selfMembershipId,
}: ResolveChatRoomEntryReadPositionInput): ChatRoomEntryReadPositionSnapshot {
  if (!receiptStateReady) {
    return createUnavailableSnapshot(roomId, generation, "RECEIPT_NOT_READY");
  }

  if (!receiptState) {
    return createUnavailableSnapshot(roomId, generation, "RECEIPT_STATE_MISSING");
  }

  if (receiptState.roomId !== roomId) {
    return createUnavailableSnapshot(roomId, generation, "ROOM_MISMATCH");
  }

  if (selfMembershipId === null || receiptState.selfMembershipId !== selfMembershipId) {
    return createUnavailableSnapshot(roomId, generation, "SELF_MEMBERSHIP_MISMATCH");
  }

  const selfPosition = receiptState.positionsByMembershipId[selfMembershipId];

  if (!selfPosition) {
    return createUnavailableSnapshot(roomId, generation, "SELF_POSITION_MISSING");
  }

  const { messageVisibleAfterSequence, storedLastReadSequence } = selfPosition;
  const entryReadThroughSequence = Math.max(messageVisibleAfterSequence, storedLastReadSequence);
  const base = {
    entryReadThroughSequence,
    generation,
    messageVisibleAfterSequence,
    roomId,
    storedLastReadSequence,
  } as const;

  if (messageVisibleAfterSequence > storedLastReadSequence) {
    return Object.freeze({
      ...base,
      mode: "visibility-boundary",
    });
  }

  if (latestConfirmedSequence === null || entryReadThroughSequence >= latestConfirmedSequence) {
    return Object.freeze({
      ...base,
      mode: "latest",
    });
  }

  return Object.freeze({
    ...base,
    dividerAfterSequence: storedLastReadSequence,
    mode: "restore",
  });
}
