import type { ChatMessage } from "./chat-room-contracts";
import type { ChatOutgoingMessage } from "./realtime/chat-message-outbox";

export type ChatMessageTimelineItem =
  | Readonly<{
      kind: "confirmed";
      message: ChatMessage;
    }>
  | Readonly<{
      kind: "outgoing";
      message: ChatOutgoingMessage;
    }>;

export function createChatMessageTimeline(
  confirmedMessages: readonly ChatMessage[],
  outgoingMessages: readonly ChatOutgoingMessage[],
): readonly ChatMessageTimelineItem[] {
  const confirmedClientMessageIds = new Set(
    confirmedMessages.map((message) => message.clientMessageId),
  );
  const confirmedItems: ChatMessageTimelineItem[] = confirmedMessages.map((message) => ({
    kind: "confirmed",
    message,
  }));
  const outgoingItems: ChatMessageTimelineItem[] = outgoingMessages
    .filter((message) => !confirmedClientMessageIds.has(message.clientMessageId))
    .map((message) => ({
      kind: "outgoing",
      message,
    }));

  return Object.freeze([...confirmedItems, ...outgoingItems]);
}
