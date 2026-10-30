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

  const { messagesBySequence } = mergeChatMessageSources(roomId, sources);
  const messages = [...messagesBySequence.values()].sort(
    (left, right) => left.roomSequence - right.roomSequence,
  );
  return inspectSortedChatMessages(messages, afterSequence);
}

export function mergePresortedChatMessages({
  roomId,
  sources,
  afterSequence,
}: MergeChatMessagesOptions): ChatMessageMergeResult {
  assertAfterSequence(afterSequence);

  const { messagesBySequence, hasNondecreasingRoomSequences } = mergeChatMessageSources(
    roomId,
    sources,
  );
  const messages = [...messagesBySequence.values()];

  if (!hasNondecreasingRoomSequences) {
    messages.sort((left, right) => left.roomSequence - right.roomSequence);
  }

  return inspectSortedChatMessages(messages, afterSequence);
}

function mergeChatMessageSources(
  roomId: string,
  sources: readonly (readonly ChatMessage[])[],
): Readonly<{
  messagesBySequence: Map<number, ChatMessage>;
  hasNondecreasingRoomSequences: boolean;
}> {
  const messagesById = new Map<string, ChatMessage>();
  const messagesBySequence = new Map<number, ChatMessage>();
  let previousSequence: number | null = null;
  let hasNondecreasingRoomSequences = true;

  for (const source of sources) {
    for (const message of source) {
      if (previousSequence !== null && message.roomSequence < previousSequence) {
        hasNondecreasingRoomSequences = false;
      }
      previousSequence = message.roomSequence;

      if (message.roomId !== roomId) {
        throw new ChatMessageMergeConflictError("ROOM_MISMATCH", null, message);
      }

      const existingById = messagesById.get(message.messageId);
      const existingBySequence = messagesBySequence.get(message.roomSequence);

      if (existingById) {
        if (!hasSameChatMessageIdentity(existingById, message)) {
          throw new ChatMessageMergeConflictError("MESSAGE_ID_CONFLICT", existingById, message);
        }

        if (message.messageVersion < existingById.messageVersion) {
          continue;
        }

        if (message.messageVersion === existingById.messageVersion) {
          if (!isSameChatMessageSnapshot(existingById, message)) {
            throw new ChatMessageMergeConflictError("MESSAGE_ID_CONFLICT", existingById, message);
          }

          continue;
        }

        messagesById.set(message.messageId, message);
        messagesBySequence.set(message.roomSequence, message);
        continue;
      }

      if (existingBySequence) {
        throw new ChatMessageMergeConflictError(
          "ROOM_SEQUENCE_CONFLICT",
          existingBySequence,
          message,
        );
      }

      messagesById.set(message.messageId, message);
      messagesBySequence.set(message.roomSequence, message);
    }
  }

  return { messagesBySequence, hasNondecreasingRoomSequences };
}

export function inspectSortedChatMessages(
  messages: readonly ChatMessage[],
  afterSequence?: number,
): ChatMessageMergeResult {
  assertAfterSequence(afterSequence);

  return {
    messages,
    gaps: findChatMessageSequenceGaps(messages, afterSequence),
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

function hasSameChatMessageIdentity(left: ChatMessage, right: ChatMessage): boolean {
  return (
    left.messageId === right.messageId &&
    left.roomId === right.roomId &&
    left.roomSequence === right.roomSequence &&
    left.countable === right.countable &&
    left.senderMembershipId === right.senderMembershipId &&
    left.clientMessageId === right.clientMessageId &&
    left.createdAt === right.createdAt
  );
}

function isSameChatMessageSnapshot(left: ChatMessage, right: ChatMessage): boolean {
  return (
    hasSameChatMessageIdentity(left, right) &&
    left.content === right.content &&
    left.state === right.state &&
    left.messageVersion === right.messageVersion &&
    left.updatedAt === right.updatedAt &&
    left.deletedAt === right.deletedAt
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
