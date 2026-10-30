import type { ChatMessage, RoomReadReceiptPosition } from "./chat-room-contracts";

export type ChatMessageReadReceiptSummary = Readonly<{
  eligibleRecipientCount: number;
  readCount: number;
  unreadCount: number;
  allRead: boolean;
}>;

export function projectMessageReadReceipt(
  message: ChatMessage,
  positions: Iterable<RoomReadReceiptPosition>,
): ChatMessageReadReceiptSummary {
  let eligibleRecipientCount = 0;
  let readCount = 0;

  for (const position of positions) {
    if (
      position.membershipId === message.senderMembershipId ||
      message.roomSequence <= position.messageVisibleAfterSequence
    ) {
      continue;
    }

    eligibleRecipientCount += 1;

    if (position.storedLastReadSequence >= message.roomSequence) {
      readCount += 1;
    }
  }

  const unreadCount = eligibleRecipientCount - readCount;

  return {
    eligibleRecipientCount,
    readCount,
    unreadCount,
    allRead: eligibleRecipientCount > 0 && unreadCount === 0,
  };
}

export function projectChatMessageReadReceipts(
  messages: readonly ChatMessage[],
  positionsByMembershipId: Readonly<Record<string, RoomReadReceiptPosition>>,
): ReadonlyMap<string, ChatMessageReadReceiptSummary> {
  const summaries = new Map<string, ChatMessageReadReceiptSummary>();
  const positions = Object.values(positionsByMembershipId);

  for (const message of messages) {
    if (message.state === "DELETED_BY_AUTHOR") {
      continue;
    }

    summaries.set(message.messageId, projectMessageReadReceipt(message, positions));
  }

  return summaries;
}
