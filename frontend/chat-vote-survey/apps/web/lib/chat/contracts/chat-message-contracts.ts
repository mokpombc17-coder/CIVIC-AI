import { z } from "zod";
import {
  cursorSchema,
  forbiddenC0ControlCharacterPattern,
  idempotencyKeySchema,
  instantSchema,
  isoControlCharacterPattern,
  javaStringStripWhitespacePattern,
  nonnegativeSequenceSchema,
  opaqueIdSchema,
  positiveMessageVersionSchema,
  positiveSequenceSchema,
  roomIdSchema,
} from "./chat-contract-primitives";

const messageHistoryLimitSchema = z.number().int().min(1).max(100);
const roomMessageSearchLimitSchema = z.number().int().min(1).max(50);
const roomMessageContextWindowSizeSchema = z.number().int().min(0).max(50);
export const ROOM_MESSAGE_SEARCH_RAW_QUERY_MAX_UTF16_CODE_UNITS = 512;
const unicodeWhitespacePattern = /\p{White_Space}+/gu;

const validatedChatMessageContentSchema = z
  .string()
  .min(1, "메시지 내용을 입력해 주세요.")
  .refine(
    (content) => Array.from(content).length <= 2_000,
    "메시지는 2,000자까지 입력할 수 있어요.",
  )
  .refine(
    (content) => new TextEncoder().encode(content).length <= 8_192,
    "메시지가 너무 깁니다. 내용을 조금 줄여 주세요.",
  )
  .refine(
    (content) => !forbiddenC0ControlCharacterPattern.test(content),
    "입력할 수 없는 문자가 포함되어 있어요. 해당 문자를 지워 주세요.",
  );

export const chatMessageContentSchema = validatedChatMessageContentSchema.refine(
  (content) => content === normalizeChatMessageContent(content),
  "메시지 content는 앞뒤 공백이 제거된 값이어야 합니다.",
);

export const chatMessageSendContentSchema = z
  .string()
  .transform(normalizeChatMessageContent)
  .pipe(validatedChatMessageContentSchema);

export function normalizeChatMessageContent(content: string): string {
  return content.replace(javaStringStripWhitespacePattern, "");
}

export const messageStateSchema = z.enum(["ACTIVE", "DELETED_BY_AUTHOR"]);

const chatMessageSnapshotBaseSchema = z.object({
  messageId: opaqueIdSchema,
  roomId: roomIdSchema,
  roomSequence: positiveSequenceSchema,
  countable: z.boolean(),
  senderMembershipId: opaqueIdSchema,
  senderParticipationId: opaqueIdSchema,
  clientMessageId: idempotencyKeySchema,
  messageVersion: positiveMessageVersionSchema,
  createdAt: instantSchema,
  updatedAt: instantSchema,
});

export const activeChatMessageSchema = chatMessageSnapshotBaseSchema.extend({
  content: chatMessageContentSchema,
  state: z.literal("ACTIVE"),
  deletedAt: z.null(),
});

export const deletedChatMessageSchema = chatMessageSnapshotBaseSchema
  .extend({
    content: z.null(),
    state: z.literal("DELETED_BY_AUTHOR"),
    deletedAt: instantSchema,
  })
  .refine((message) => message.deletedAt === message.updatedAt, {
    message: "삭제 메시지의 deletedAt과 updatedAt은 같아야 합니다.",
    path: ["deletedAt"],
  });

export const chatMessageSchema = z.union([activeChatMessageSchema, deletedChatMessageSchema]);

export const roomMessageSearchQuerySchema = z
  .string()
  .max(
    ROOM_MESSAGE_SEARCH_RAW_QUERY_MAX_UTF16_CODE_UNITS,
    "검색어 원문은 UTF-16 code unit 기준 512자를 초과할 수 없습니다.",
  )
  .refine(
    (query) => !isoControlCharacterPattern.test(query),
    "검색어에 제어 문자를 포함할 수 없습니다.",
  )
  .transform(normalizeRoomMessageSearchQuery)
  .refine(
    (query) => Array.from(query).length >= 2,
    "검색어는 Unicode code point 기준 2자 이상이어야 합니다.",
  )
  .refine(
    (query) => Array.from(query).length <= 100,
    "검색어는 Unicode code point 기준 100자를 초과할 수 없습니다.",
  );

export function normalizeRoomMessageSearchQuery(query: string): string {
  return query.trim().replace(unicodeWhitespacePattern, " ").normalize("NFC").toLowerCase();
}

export const roomMessageSearchRequestSchema = z
  .object({
    query: roomMessageSearchQuerySchema,
    cursor: cursorSchema.nullable().optional(),
    limit: roomMessageSearchLimitSchema.nullable().optional(),
  })
  .strict();

const roomMessageSearchItemSchema = activeChatMessageSchema.extend({
  countable: z.literal(true),
});

const roomMessageSearchResponseBaseSchema = z.object({
  items: z.array(roomMessageSearchItemSchema),
  nextCursor: cursorSchema.nullable(),
  searchComplete: z.boolean(),
});

export function createRoomMessageSearchResponseSchema(expectedRoomId: string) {
  const parsedRoomId = roomIdSchema.parse(expectedRoomId);

  return roomMessageSearchResponseBaseSchema.superRefine((response, context) => {
    if (response.searchComplete && response.nextCursor !== null) {
      context.addIssue({
        code: "custom",
        path: ["nextCursor"],
        message: "검색이 완료되면 nextCursor는 null이어야 합니다.",
      });
    }

    if (!response.searchComplete && response.nextCursor === null) {
      context.addIssue({
        code: "custom",
        path: ["nextCursor"],
        message: "검색이 완료되지 않았으면 nextCursor가 필요합니다.",
      });
    }

    const messageIds = new Set<string>();

    response.items.forEach((message, index) => {
      if (message.roomId !== parsedRoomId) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "roomId"],
          message: "요청한 방과 다른 roomId의 검색 결과를 반환할 수 없습니다.",
        });
      }

      if (messageIds.has(message.messageId)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "messageId"],
          message: "검색 결과 messageId는 중복될 수 없습니다.",
        });
      }
      messageIds.add(message.messageId);

      const previousMessage = response.items[index - 1];

      if (previousMessage && message.roomSequence >= previousMessage.roomSequence) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "roomSequence"],
          message: "검색 결과는 roomSequence 내림차순이어야 합니다.",
        });
      }
    });
  });
}

export const roomMessageContextParamsSchema = z
  .object({
    before: roomMessageContextWindowSizeSchema.optional(),
    after: roomMessageContextWindowSizeSchema.optional(),
  })
  .strict();

const roomMessageContextResponseBaseSchema = z.object({
  targetMessageId: opaqueIdSchema,
  targetRoomSequence: positiveSequenceSchema,
  items: z.array(chatMessageSchema),
  nextBeforeSequence: positiveSequenceSchema.nullable(),
  nextAfterSequence: nonnegativeSequenceSchema.nullable(),
  hasOlder: z.boolean(),
  hasNewer: z.boolean(),
});

export function createRoomMessageContextResponseSchema(
  expectedRoomId: string,
  expectedMessageId: string,
) {
  const parsedRoomId = roomIdSchema.parse(expectedRoomId);
  const parsedMessageId = opaqueIdSchema.parse(expectedMessageId);

  return roomMessageContextResponseBaseSchema.superRefine((response, context) => {
    if (response.hasOlder !== (response.nextBeforeSequence !== null)) {
      context.addIssue({
        code: "custom",
        path: ["nextBeforeSequence"],
        message: "hasOlder와 nextBeforeSequence 존재 여부가 일치해야 합니다.",
      });
    }

    if (response.hasNewer !== (response.nextAfterSequence !== null)) {
      context.addIssue({
        code: "custom",
        path: ["nextAfterSequence"],
        message: "hasNewer와 nextAfterSequence 존재 여부가 일치해야 합니다.",
      });
    }

    if (response.targetMessageId !== parsedMessageId) {
      context.addIssue({
        code: "custom",
        path: ["targetMessageId"],
        message: "요청한 messageId와 Context targetMessageId가 일치해야 합니다.",
      });
    }

    const targetIndexes: number[] = [];

    response.items.forEach((message, index) => {
      if (message.roomId !== parsedRoomId) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "roomId"],
          message: "요청한 방과 다른 roomId의 Context 메시지를 반환할 수 없습니다.",
        });
      }

      if (message.messageId === response.targetMessageId) {
        targetIndexes.push(index);

        if (message.roomSequence !== response.targetRoomSequence) {
          context.addIssue({
            code: "custom",
            path: ["targetRoomSequence"],
            message: "Context target의 roomSequence가 targetRoomSequence와 일치해야 합니다.",
          });
        }
      }

      const previousMessage = response.items[index - 1];

      if (previousMessage && message.roomSequence <= previousMessage.roomSequence) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "roomSequence"],
          message: "Context 메시지는 roomSequence 오름차순이어야 합니다.",
        });
      }
    });

    if (targetIndexes.length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "Context target 메시지는 items에 정확히 한 번 포함되어야 합니다.",
      });
    }
  });
}

export const messageHistoryModeSchema = z.enum(["latest", "before", "after"]);

export const messageHistoryRequestSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("latest"),
      limit: messageHistoryLimitSchema.optional(),
    })
    .strict(),
  z
    .object({
      mode: z.literal("before"),
      beforeSequence: positiveSequenceSchema,
      limit: messageHistoryLimitSchema.optional(),
    })
    .strict(),
  z
    .object({
      mode: z.literal("after"),
      afterSequence: nonnegativeSequenceSchema,
      limit: messageHistoryLimitSchema.optional(),
    })
    .strict(),
]);

const messageHistoryResponseBaseSchema = z.object({
  items: z.array(chatMessageSchema),
  nextBeforeSequence: positiveSequenceSchema.nullable(),
  nextAfterSequence: nonnegativeSequenceSchema.nullable(),
  hasMore: z.boolean(),
});

export type MessageState = z.infer<typeof messageStateSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type RoomMessageSearchRequest = z.input<typeof roomMessageSearchRequestSchema>;
export type NormalizedRoomMessageSearchRequest = z.output<typeof roomMessageSearchRequestSchema>;
export type RoomMessageSearchResponse = z.infer<typeof roomMessageSearchResponseBaseSchema>;
export type RoomMessageContextParams = z.input<typeof roomMessageContextParamsSchema>;
export type RoomMessageContextResponse = z.infer<typeof roomMessageContextResponseBaseSchema>;
export type MessageHistoryMode = z.infer<typeof messageHistoryModeSchema>;
export type MessageHistoryRequest = z.input<typeof messageHistoryRequestSchema>;
export type MessageHistoryResponse = z.infer<typeof messageHistoryResponseBaseSchema>;

export function createMessageHistoryResponseSchema(
  request: MessageHistoryRequest,
  expectedRoomId: string,
) {
  return messageHistoryResponseBaseSchema.superRefine((history, context) => {
    const { mode } = request;
    const expectsBeforeCursor = mode === "latest" || mode === "before";
    const expectedCursor = expectsBeforeCursor
      ? history.nextBeforeSequence
      : history.nextAfterSequence;
    const unexpectedCursor = expectsBeforeCursor
      ? history.nextAfterSequence
      : history.nextBeforeSequence;

    if (history.hasMore && expectedCursor === null) {
      context.addIssue({
        code: "custom",
        path: [expectsBeforeCursor ? "nextBeforeSequence" : "nextAfterSequence"],
        message: `${mode} 조회에서 hasMore가 true이면 다음 sequence가 필요합니다.`,
      });
    }

    if (!history.hasMore && expectedCursor !== null) {
      context.addIssue({
        code: "custom",
        path: [expectsBeforeCursor ? "nextBeforeSequence" : "nextAfterSequence"],
        message: "hasMore가 false이면 다음 sequence는 null이어야 합니다.",
      });
    }

    if (unexpectedCursor !== null) {
      context.addIssue({
        code: "custom",
        path: [expectsBeforeCursor ? "nextAfterSequence" : "nextBeforeSequence"],
        message: `${mode} 조회에서 반대 방향 sequence를 반환할 수 없습니다.`,
      });
    }

    history.items.forEach((message, index) => {
      if (message.roomId !== expectedRoomId) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "roomId"],
          message: "요청한 방과 다른 roomId의 메시지를 반환할 수 없습니다.",
        });
      }

      if (
        (request.mode === "before" && message.roomSequence >= request.beforeSequence) ||
        (request.mode === "after" && message.roomSequence <= request.afterSequence)
      ) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "roomSequence"],
          message: `${request.mode} 조회의 sequence 범위를 벗어난 메시지입니다.`,
        });
      }

      const previousMessage = history.items[index - 1];

      if (previousMessage && message.roomSequence <= previousMessage.roomSequence) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "roomSequence"],
          message: "메시지는 roomSequence 오름차순이어야 합니다.",
        });
      }
    });
  });
}
