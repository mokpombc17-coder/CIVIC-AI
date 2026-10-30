import type { ChatMessage } from "@/lib/chat/chat-room-contracts";
import {
  projectChatMessageReadReceipts,
  type ChatMessageReadReceiptSummary,
} from "@/lib/chat/chat-message-read-receipt-projector";
import type { ChatRoomReadReceiptState } from "@/lib/chat/chat-room-read-receipt-state";
import type { ChatRoomReadReceiptSyncStatus } from "@/lib/chat/realtime/chat-room-read-receipt-coordinator";

export type ChatMessageReadReceiptPresentation = Readonly<{
  membershipMismatch: boolean;
  summaries: ReadonlyMap<string, ChatMessageReadReceiptSummary>;
}>;

export function createChatMessageReadReceiptPresentation({
  messages,
  receiptState,
  receiptSyncStatus,
  selfMembershipId,
}: Readonly<{
  messages: readonly ChatMessage[];
  receiptState: ChatRoomReadReceiptState | undefined;
  receiptSyncStatus: ChatRoomReadReceiptSyncStatus;
  selfMembershipId: string | null;
}>): ChatMessageReadReceiptPresentation {
  const membershipMismatch =
    receiptState !== undefined &&
    selfMembershipId !== null &&
    receiptState.selfMembershipId !== selfMembershipId;

  if (
    receiptSyncStatus !== "ready" ||
    receiptState === undefined ||
    selfMembershipId === null ||
    membershipMismatch
  ) {
    return {
      membershipMismatch,
      summaries: new Map(),
    };
  }

  return {
    membershipMismatch: false,
    summaries: projectChatMessageReadReceipts(messages, receiptState.positionsByMembershipId),
  };
}
