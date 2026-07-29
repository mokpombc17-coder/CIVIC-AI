import type { ChatMessage } from "./chat-room-contracts";

export type ChatMessageMergeConflictCode =
  "ROOM_MISMATCH" | "MESSAGE_ID_CONFLICT" | "ROOM_SEQUENCE_CONFLICT";

export type ChatMessageSequenceGap = Readonly<{
  afterSequence: number;
  beforeSequence: number;
  missingFromSequence: number;
  missingToSequence: number;
}>;

export type MergeChatMessagesOptions = Readonly<{
  roomId: string;
  sources: readonly (readonly ChatMessage[])[];
  afterSequence?: number;
}>;

export type ChatMessageMergeResult = Readonly<{
  messages: readonly ChatMessage[];
  gaps: readonly ChatMessageSequenceGap[];
  lastContiguousSequence: number | null;
}>;

export class ChatMessageMergeConflictError extends Error {
  override readonly name = "ChatMessageMergeConflictError";

  constructor(
    readonly code: ChatMessageMergeConflictCode,
    readonly existingMessage: ChatMessage | null,
    readonly incomingMessage: ChatMessage,
  ) {
    super(createConflictMessage(code, incomingMessage));
  }
}

export function mergeChatMessages({
  roomId,
  sources,
  afterSequence,
}: MergeChatMessagesOptions): ChatMessageMergeResult {
  assertAfterSequence(afterSequence);

  const messagesById = new Map<string, ChatMessage>();
  const messagesBySequence = new Map<number, ChatMessage>();

  for (const source of sources) {
    for (const message of source) {
      if (message.roomId !== roomId) {
        throw new ChatMessageMergeConflictError("ROOM_MISMATCH", null, message);
      }

      const existingById = messagesById.get(message.messageId);
      const existingBySequence = messagesBySequence.get(message.roomSequence);

      if (existingById && !isSameChatMessage(existingById, message)) {
        throw new ChatMessageMergeConflictError("MESSAGE_ID_CONFLICT", existingById, message);
      }

      if (existingBySequence && !isSameChatMessage(existingBySequence, message)) {
        throw new ChatMessageMergeConflictError(
          "ROOM_SEQUENCE_CONFLICT",
          existingBySequence,
          message,
        );
      }

      if (existingById || existingBySequence) {
        continue;
      }

      messagesById.set(message.messageId, message);
      messagesBySequence.set(message.roomSequence, message);
    }
  }

  const messages = [...messagesBySequence.values()].sort(
    (left, right) => left.roomSequence - right.roomSequence,
  );
  const gaps = findChatMessageSequenceGaps(messages, afterSequence);

  return {
    messages,
    gaps,
    lastContiguousSequence: findLastContiguousSequence(messages, afterSequence),
  };
}

function findChatMessageSequenceGaps(
  messages: readonly ChatMessage[],
  afterSequence: number | undefined,
): readonly ChatMessageSequenceGap[] {
  if (messages.length === 0) {
    return [];
  }

  let previousSequence = afterSequence ?? messages[0]!.roomSequence;
  const gaps: ChatMessageSequenceGap[] = [];

  for (const message of messages) {
    if (message.roomSequence <= previousSequence) {
      continue;
    }

    if (message.roomSequence > previousSequence + 1) {
      gaps.push({
        afterSequence: previousSequence,
        beforeSequence: message.roomSequence,
        missingFromSequence: previousSequence + 1,
        missingToSequence: message.roomSequence - 1,
      });
    }

    previousSequence = message.roomSequence;
  }

  return gaps;
}

function findLastContiguousSequence(
  messages: readonly ChatMessage[],
  afterSequence: number | undefined,
): number | null {
  if (afterSequence === undefined && messages.length === 0) {
    return null;
  }

  let lastSequence = afterSequence ?? messages[0]!.roomSequence;

  for (const message of messages) {
    if (message.roomSequence <= lastSequence) {
      continue;
    }

    if (message.roomSequence !== lastSequence + 1) {
      break;
    }

    lastSequence = message.roomSequence;
  }

  return lastSequence;
}

function isSameChatMessage(left: ChatMessage, right: ChatMessage): boolean {
  return (
    left.messageId === right.messageId &&
    left.roomId === right.roomId &&
    left.roomSequence === right.roomSequence &&
    left.senderUserId === right.senderUserId &&
    left.clientMessageId === right.clientMessageId &&
    left.content === right.content &&
    left.createdAt === right.createdAt
  );
}

function assertAfterSequence(afterSequence: number | undefined): void {
  if (afterSequence !== undefined && (!Number.isSafeInteger(afterSequence) || afterSequence < 0)) {
    throw new RangeError("afterSequence는 0 이상의 안전한 정수여야 합니다.");
  }
}

function createConflictMessage(code: ChatMessageMergeConflictCode, message: ChatMessage): string {
  switch (code) {
    case "ROOM_MISMATCH":
      return `다른 방(${message.roomId})의 메시지를 병합할 수 없습니다.`;
    case "MESSAGE_ID_CONFLICT":
      return `messageId ${message.messageId}의 메시지 내용이 서로 다릅니다.`;
    case "ROOM_SEQUENCE_CONFLICT":
      return `roomSequence ${message.roomSequence}에 서로 다른 메시지가 있습니다.`;
  }
}
