import { z } from "zod";
import { isStrictlyAscendingByMembershipId } from "./chat-membership-id-order";

const opaqueIdSchema = z.string().min(1);
const versionSchema = z.number().int().nonnegative();
const instantSchema = z.string().datetime({ offset: true });
const nullableInstantSchema = instantSchema.nullable();
const cursorSchema = z.string().min(1);
const positiveSequenceSchema = z.number().int().min(1);
const nonnegativeSequenceSchema = z.number().int().nonnegative();
const safeNonnegativeIntegerSchema = z
  .number()
  .refine((value) => Number.isSafeInteger(value) && value >= 0, {
    message: "0 이상의 안전한 정수여야 합니다.",
  });
const positiveMessageVersionSchema = z.number().int().positive();
const messageHistoryLimitSchema = z.number().int().min(1).max(100);
const roomMessageSearchLimitSchema = z.number().int().min(1).max(50);
const roomMessageContextWindowSizeSchema = z.number().int().min(0).max(50);
export const ROOM_MESSAGE_SEARCH_RAW_QUERY_MAX_UTF16_CODE_UNITS = 512;
const forbiddenC0ControlCharacterPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u;
const isoControlCharacterPattern = /[\u0000-\u001F\u007F-\u009F]/u;
const unicodeWhitespacePattern = /\p{White_Space}+/gu;
const javaStringStripWhitespacePattern =
  /^[\u0009-\u000D\u001C-\u001F\u0020\u1680\u2000-\u2006\u2008-\u200A\u2028\u2029\u205F\u3000]+|[\u0009-\u000D\u001C-\u001F\u0020\u1680\u2000-\u2006\u2008-\u200A\u2028\u2029\u205F\u3000]+$/gu;

export const roomIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "roomId 형식이 올바르지 않습니다.");
export const roomNameSchema = z.string().trim().min(1).max(100);
export const idempotencyKeySchema = z.string().uuid();

const validatedChatMessageContentSchema = z
  .string()
  .min(1, "메시지는 공백으로만 구성될 수 없습니다.")
  .refine(
    (content) => Array.from(content).length <= 2_000,
    "메시지는 Unicode code point 2,000자를 초과할 수 없습니다.",
  )
  .refine(
    (content) => new TextEncoder().encode(content).length <= 8_192,
    "메시지는 UTF-8 8,192 bytes를 초과할 수 없습니다.",
  )
  .refine(
    (content) => !forbiddenC0ControlCharacterPattern.test(content),
    "메시지에 허용되지 않은 제어 문자가 포함되어 있습니다.",
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

const validatedRoomDescriptionSchema = z
  .string()
  .refine(
    (description) => !forbiddenC0ControlCharacterPattern.test(description),
    "방 설명에 허용되지 않은 제어 문자가 포함되어 있습니다.",
  )
  .refine(
    (description) => Array.from(description).length <= 500,
    "방 설명은 Unicode code point 500자를 초과할 수 없습니다.",
  );

export const roomDescriptionSchema = validatedRoomDescriptionSchema.refine(
  (description) => description === normalizeRoomDescription(description),
  "방 설명은 앞뒤 공백이 제거된 값이어야 합니다.",
);

export const roomDescriptionInputSchema = z
  .string()
  .refine(
    (description) => !forbiddenC0ControlCharacterPattern.test(description),
    "방 설명에 허용되지 않은 제어 문자가 포함되어 있습니다.",
  )
  .transform(normalizeRoomDescription)
  .pipe(validatedRoomDescriptionSchema);

export function normalizeRoomDescription(description: string): string {
  return description.replace(javaStringStripWhitespacePattern, "");
}

export const roomVisibilitySchema = z.enum(["LISTED", "UNLISTED"]);
export const joinPolicySchema = z.enum(["OPEN", "INVITE_ONLY"]);
export const roomCategoryIdSchema = opaqueIdSchema;
export const roomCategoryIdsSchema = z.array(roomCategoryIdSchema);
export const roomStatusSchema = z.enum(["ACTIVE", "CLOSED"]);
export const membershipRoleSchema = z.enum(["OWNER", "MEMBER"]);
export const membershipStatusSchema = z.enum(["ACTIVE", "LEFT", "BANNED"]);
export const membershipDisplayNameSchema = z
  .string()
  .min(1, "참여자 표시 이름은 비어 있을 수 없습니다.")
  .refine(
    (displayName) => displayName === displayName.replace(javaStringStripWhitespacePattern, ""),
    "참여자 표시 이름은 앞뒤 공백이 제거된 값이어야 합니다.",
  )
  .refine(
    (displayName) => Array.from(displayName).length <= 50,
    "참여자 표시 이름은 Unicode code point 50자를 초과할 수 없습니다.",
  );
export const messageStateSchema = z.enum(["ACTIVE", "DELETED_BY_AUTHOR"]);
export const roomParticipationStatusSchema = z.enum([
  "ACTIVE",
  "LEFT",
  "BANNED",
  "NOT_JOINED",
  "ROOM_CLOSED",
]);

export const publicRoomSearchQuerySchema = z
  .string()
  .refine(
    (query) => !isoControlCharacterPattern.test(query),
    "공개 방 검색어에 제어 문자를 포함할 수 없습니다.",
  )
  .transform((query) => query.replace(javaStringStripWhitespacePattern, ""))
  .refine(
    (query) => Array.from(query).length <= 100,
    "공개 방 검색어는 Unicode code point 100자를 초과할 수 없습니다.",
  )
  .transform((query) => query || undefined);

export const roomMembershipSchema = z.object({
  membershipId: opaqueIdSchema,
  roomId: roomIdSchema,
  role: membershipRoleSchema,
  status: membershipStatusSchema,
  joinedAt: instantSchema,
  leftAt: nullableInstantSchema,
  bannedAt: nullableInstantSchema,
  version: versionSchema,
});

export const roomSettingsSchema = z.object({
  name: roomNameSchema,
  description: roomDescriptionSchema,
  categoryIds: roomCategoryIdsSchema,
  visibility: roomVisibilitySchema,
  joinPolicy: joinPolicySchema,
});

export const publicRoomListItemSchema = roomSettingsSchema.extend({
  roomId: roomIdSchema,
  ownerMembershipId: opaqueIdSchema,
  status: roomStatusSchema,
  activeMemberCount: z.number().int().nonnegative(),
  createdAt: instantSchema,
  version: versionSchema,
});

export const roomDetailsSchema = publicRoomListItemSchema.extend({
  closedAt: nullableInstantSchema,
  participationStatus: roomParticipationStatusSchema,
  myMembership: roomMembershipSchema.nullable(),
});

export const myRoomListItemSchema = publicRoomListItemSchema.extend({
  membershipId: opaqueIdSchema,
  membershipRole: membershipRoleSchema,
  membershipStatus: membershipStatusSchema,
  joinedAt: instantSchema,
  membershipVersion: versionSchema,
});

const roomInboxLastMessageBaseSchema = z.object({
  messageId: opaqueIdSchema,
  roomSequence: positiveSequenceSchema,
  messageVersion: positiveMessageVersionSchema,
  createdAt: instantSchema,
});

const activeRoomInboxLastMessageSchema = roomInboxLastMessageBaseSchema.extend({
  state: z.literal("ACTIVE"),
  preview: z
    .string()
    .refine(
      (preview) => Array.from(preview).length <= 60,
      "Room inbox preview는 Unicode code point 60자를 초과할 수 없습니다.",
    ),
  previewTruncated: z.boolean(),
});

const deletedRoomInboxLastMessageSchema = roomInboxLastMessageBaseSchema.extend({
  state: z.literal("DELETED_BY_AUTHOR"),
  preview: z.null(),
  previewTruncated: z.literal(false),
});

export const roomInboxLastMessageSchema = z.discriminatedUnion("state", [
  activeRoomInboxLastMessageSchema,
  deletedRoomInboxLastMessageSchema,
]);

export const roomInboxListItemSchema = myRoomListItemSchema
  .extend({
    readThroughSequence: nonnegativeSequenceSchema,
    unreadCount: z.number().int().nonnegative(),
    unreadCountCapped: z.boolean(),
    lastMessage: roomInboxLastMessageSchema.nullable(),
    lastActivityAt: instantSchema,
  })
  .superRefine((room, context) => {
    if (
      room.lastMessage !== null &&
      Date.parse(room.lastMessage.createdAt) !== Date.parse(room.lastActivityAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["lastActivityAt"],
        message: "lastMessage.createdAt과 lastActivityAt은 같은 시각이어야 합니다.",
      });
    }
  });

export const roomMembershipListItemSchema = z.object({
  membershipId: opaqueIdSchema,
  displayName: membershipDisplayNameSchema,
  imageUrl: z.string().nullable(),
  profileVersion: z.number().int().positive(),
  role: membershipRoleSchema,
  status: membershipStatusSchema,
  joinedAt: instantSchema,
  leftAt: nullableInstantSchema,
  bannedAt: nullableInstantSchema,
  version: versionSchema,
});

export const publicRoomListResponseSchema = createCursorPageSchema(publicRoomListItemSchema);
export const myRoomListResponseSchema = createCursorPageSchema(myRoomListItemSchema);
export const roomInboxListResponseSchema = createCursorPageSchema(roomInboxListItemSchema);
export const roomMembershipListResponseSchema = createCursorPageSchema(
  roomMembershipListItemSchema,
);

export const createRoomRequestSchema = z.object({
  name: roomNameSchema,
  description: roomDescriptionInputSchema.nullish().transform((description) => description ?? ""),
  visibility: roomVisibilitySchema,
  joinPolicy: joinPolicySchema,
});

export const updateRoomSettingsRequestSchema = z
  .object({
    name: roomNameSchema.optional(),
    description: roomDescriptionInputSchema.optional(),
    visibility: roomVisibilitySchema.optional(),
    joinPolicy: joinPolicySchema.optional(),
  })
  .strict()
  .refine(
    (settings) =>
      settings.name !== undefined ||
      settings.description !== undefined ||
      settings.visibility !== undefined ||
      settings.joinPolicy !== undefined,
    "변경할 방 설정을 하나 이상 입력해야 합니다.",
  );

export const targetMembershipRequestSchema = z
  .object({
    targetMembershipId: z.string().trim().min(1),
  })
  .strict();

const commandResponseBaseSchema = z.object({
  clientRequestId: idempotencyKeySchema,
  replayed: z.boolean(),
  roomId: roomIdSchema,
});

export const roomCreationRequestStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELED",
]);

export const roomCreationRequestIdSchema = opaqueIdSchema;

export const roomCreationRejectionReasonSchema = z
  .string()
  .min(1, "방 생성 반려 사유는 비어 있을 수 없습니다.")
  .refine(
    (reason) => reason === reason.replace(javaStringStripWhitespacePattern, ""),
    "방 생성 반려 사유는 앞뒤 공백이 제거된 값이어야 합니다.",
  )
  .refine(
    (reason) => !isoControlCharacterPattern.test(reason),
    "방 생성 반려 사유에는 제어 문자나 줄바꿈을 포함할 수 없습니다.",
  )
  .refine(
    (reason) => Array.from(reason).length <= 100,
    "방 생성 반려 사유는 Unicode code point 100자를 초과할 수 없습니다.",
  );

const roomCreationRequestResponseBaseSchema = z.object({
  clientRequestId: idempotencyKeySchema,
  replayed: z.boolean(),
  creationRequestId: opaqueIdSchema,
  requestedAt: instantSchema,
});

const pendingRoomCreationRequestResponseSchema = roomCreationRequestResponseBaseSchema.extend({
  code: z.literal("ROOM_CREATION_REQUESTED"),
  status: z.literal("PENDING"),
  resolvedAt: z.null(),
  roomId: z.null(),
  ownerMembershipId: z.null(),
  roomVersion: z.null(),
  ownerMembershipVersion: z.null(),
  rejectionReason: z.null(),
});

const approvedRoomCreationRequestResponseSchema = roomCreationRequestResponseBaseSchema.extend({
  code: z.literal("ROOM_CREATED"),
  status: z.literal("APPROVED"),
  resolvedAt: instantSchema,
  roomId: roomIdSchema,
  ownerMembershipId: opaqueIdSchema,
  roomVersion: versionSchema,
  ownerMembershipVersion: versionSchema,
  rejectionReason: z.null(),
});

const rejectedRoomCreationRequestResponseSchema = roomCreationRequestResponseBaseSchema.extend({
  code: z.literal("ROOM_CREATION_REJECTED"),
  status: z.literal("REJECTED"),
  resolvedAt: instantSchema,
  roomId: z.null(),
  ownerMembershipId: z.null(),
  roomVersion: z.null(),
  ownerMembershipVersion: z.null(),
  rejectionReason: roomCreationRejectionReasonSchema,
});

const canceledRoomCreationRequestResponseSchema = roomCreationRequestResponseBaseSchema.extend({
  code: z.literal("ROOM_CREATION_CANCELED"),
  status: z.literal("CANCELED"),
  resolvedAt: instantSchema,
  roomId: z.null(),
  ownerMembershipId: z.null(),
  roomVersion: z.null(),
  ownerMembershipVersion: z.null(),
  rejectionReason: z.null(),
});

export const roomCreationRequestResponseSchema = z.discriminatedUnion("status", [
  pendingRoomCreationRequestResponseSchema,
  approvedRoomCreationRequestResponseSchema,
  rejectedRoomCreationRequestResponseSchema,
  canceledRoomCreationRequestResponseSchema,
]);

export const createRoomResponseSchema = roomCreationRequestResponseSchema;
export const roomCreationRequestListResponseSchema = createCursorPageSchema(
  roomCreationRequestResponseSchema,
);

export const updateRoomSettingsResponseSchema = commandResponseBaseSchema.extend({
  code: z.enum(["ROOM_SETTINGS_UPDATED", "ROOM_SETTINGS_UNCHANGED"]),
  ...roomSettingsSchema.shape,
  roomVersion: versionSchema,
});

const membershipCommandResponseFields = {
  membershipId: opaqueIdSchema,
  roomVersion: versionSchema,
  membershipVersion: versionSchema,
} as const;

export const joinRoomResponseSchema = commandResponseBaseSchema.extend({
  code: z.enum(["JOINED", "REJOINED", "ALREADY_ACTIVE"]),
  ...membershipCommandResponseFields,
});

export const leaveRoomResponseSchema = commandResponseBaseSchema.extend({
  code: z.enum(["LEFT", "ALREADY_LEFT"]),
  ...membershipCommandResponseFields,
});

export const transferRoomOwnershipResponseSchema = commandResponseBaseSchema.extend({
  code: z.literal("OWNERSHIP_TRANSFERRED"),
  previousOwnerMembershipId: opaqueIdSchema,
  newOwnerMembershipId: opaqueIdSchema,
  roomVersion: versionSchema,
  previousOwnerMembershipVersion: versionSchema,
  newOwnerMembershipVersion: versionSchema,
});

const memberBanCommandResponseFields = {
  targetMembershipId: opaqueIdSchema,
  roomVersion: versionSchema,
  membershipVersion: versionSchema,
} as const;

export const banRoomMemberResponseSchema = commandResponseBaseSchema.extend({
  code: z.enum(["BANNED", "ALREADY_BANNED"]),
  ...memberBanCommandResponseFields,
});

export const unbanRoomMemberResponseSchema = commandResponseBaseSchema.extend({
  code: z.enum(["UNBANNED", "ALREADY_UNBANNED"]),
  ...memberBanCommandResponseFields,
});

export const closeRoomResponseSchema = commandResponseBaseSchema.extend({
  code: z.enum(["CLOSED", "ALREADY_CLOSED"]),
  ownerMembershipId: opaqueIdSchema,
  roomVersion: versionSchema,
  ownerMembershipVersion: versionSchema,
});

const chatMessageSnapshotBaseSchema = z.object({
  messageId: opaqueIdSchema,
  roomId: roomIdSchema,
  roomSequence: positiveSequenceSchema,
  countable: z.boolean(),
  senderMembershipId: opaqueIdSchema,
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

export const cursorPaginationParamsSchema = z.object({
  cursor: cursorSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const publicRoomListParamsSchema = cursorPaginationParamsSchema.extend({
  query: publicRoomSearchQuerySchema.optional(),
  categoryId: roomCategoryIdSchema.optional(),
  joinPolicy: joinPolicySchema.optional(),
});

export const roomInboxListParamsSchema = z.object({
  cursor: cursorSchema.optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

export const updateRoomReadStateRequestSchema = z
  .object({
    throughSequence: nonnegativeSequenceSchema,
  })
  .strict();

export const updateRoomReadStateResponseSchema = z.object({
  roomId: roomIdSchema,
  readThroughSequence: nonnegativeSequenceSchema,
  updated: z.boolean(),
});

export const roomReadReceiptPositionSchema = z.object({
  membershipId: opaqueIdSchema,
  membershipVersion: safeNonnegativeIntegerSchema,
  messageVisibleAfterSequence: safeNonnegativeIntegerSchema,
  storedLastReadSequence: safeNonnegativeIntegerSchema,
});

export const roomReadReceiptStateResponseSchema = z
  .object({
    roomId: roomIdSchema,
    roomVersion: safeNonnegativeIntegerSchema,
    selfMembershipId: opaqueIdSchema,
    positions: z.array(roomReadReceiptPositionSchema).max(100),
    generatedAt: instantSchema,
  })
  .superRefine((state, context) => {
    const membershipIds = new Set<string>();

    state.positions.forEach((position, index) => {
      if (membershipIds.has(position.membershipId)) {
        context.addIssue({
          code: "custom",
          path: ["positions", index, "membershipId"],
          message: "Read Receipt position의 membershipId는 중복될 수 없습니다.",
        });
      }

      membershipIds.add(position.membershipId);
    });

    if (!membershipIds.has(state.selfMembershipId)) {
      context.addIssue({
        code: "custom",
        path: ["selfMembershipId"],
        message: "selfMembershipId는 positions에 포함되어야 합니다.",
      });
    }

    if (!isStrictlyAscendingByMembershipId(state.positions)) {
      context.addIssue({
        code: "custom",
        path: ["positions"],
        message:
          "Read Receipt positions는 membershipId raw string natural order로 오름차순이어야 합니다.",
      });
    }
  });

export const roomMembershipListParamsSchema = cursorPaginationParamsSchema.extend({
  status: membershipStatusSchema.optional(),
});

export type RoomVisibility = z.infer<typeof roomVisibilitySchema>;
export type JoinPolicy = z.infer<typeof joinPolicySchema>;
export type RoomCategoryId = z.infer<typeof roomCategoryIdSchema>;
export type RoomCategoryIds = readonly RoomCategoryId[];
export type RoomStatus = z.infer<typeof roomStatusSchema>;
export type MembershipRole = z.infer<typeof membershipRoleSchema>;
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;
export type MessageState = z.infer<typeof messageStateSchema>;
export type RoomParticipationStatus = z.infer<typeof roomParticipationStatusSchema>;
export type RoomSettings = z.infer<typeof roomSettingsSchema>;
export type RoomMembership = z.infer<typeof roomMembershipSchema>;
export type PublicRoomListItem = z.infer<typeof publicRoomListItemSchema>;
export type RoomDetails = z.infer<typeof roomDetailsSchema>;
export type MyRoomListItem = z.infer<typeof myRoomListItemSchema>;
export type RoomInboxLastMessage = z.infer<typeof roomInboxLastMessageSchema>;
export type RoomInboxListItem = z.infer<typeof roomInboxListItemSchema>;
export type RoomMembershipListItem = z.infer<typeof roomMembershipListItemSchema>;
export type PublicRoomListResponse = z.infer<typeof publicRoomListResponseSchema>;
export type MyRoomListResponse = z.infer<typeof myRoomListResponseSchema>;
export type RoomInboxListResponse = z.infer<typeof roomInboxListResponseSchema>;
export type RoomMembershipListResponse = z.infer<typeof roomMembershipListResponseSchema>;
export type CreateRoomRequest = z.input<typeof createRoomRequestSchema>;
export type UpdateRoomSettingsRequest = z.input<typeof updateRoomSettingsRequestSchema>;
export type TargetMembershipRequest = z.infer<typeof targetMembershipRequestSchema>;
export type RoomCreationRequestStatus = z.infer<typeof roomCreationRequestStatusSchema>;
export type RoomCreationRequestResponse = z.infer<typeof roomCreationRequestResponseSchema>;
export type RoomCreationRequestListResponse = z.infer<typeof roomCreationRequestListResponseSchema>;
export type CreateRoomResponse = z.infer<typeof createRoomResponseSchema>;
export type UpdateRoomSettingsResponse = z.infer<typeof updateRoomSettingsResponseSchema>;
export type JoinRoomResponse = z.infer<typeof joinRoomResponseSchema>;
export type LeaveRoomResponse = z.infer<typeof leaveRoomResponseSchema>;
export type TransferRoomOwnershipResponse = z.infer<typeof transferRoomOwnershipResponseSchema>;
export type BanRoomMemberResponse = z.infer<typeof banRoomMemberResponseSchema>;
export type UnbanRoomMemberResponse = z.infer<typeof unbanRoomMemberResponseSchema>;
export type CloseRoomResponse = z.infer<typeof closeRoomResponseSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type RoomMessageSearchRequest = z.input<typeof roomMessageSearchRequestSchema>;
export type NormalizedRoomMessageSearchRequest = z.output<typeof roomMessageSearchRequestSchema>;
export type RoomMessageSearchResponse = z.infer<typeof roomMessageSearchResponseBaseSchema>;
export type RoomMessageContextParams = z.input<typeof roomMessageContextParamsSchema>;
export type RoomMessageContextResponse = z.infer<typeof roomMessageContextResponseBaseSchema>;
export type MessageHistoryMode = z.infer<typeof messageHistoryModeSchema>;
export type MessageHistoryRequest = z.input<typeof messageHistoryRequestSchema>;
export type MessageHistoryResponse = z.infer<typeof messageHistoryResponseBaseSchema>;
export type CursorPaginationParams = z.input<typeof cursorPaginationParamsSchema>;
export type PublicRoomListParams = z.input<typeof publicRoomListParamsSchema>;
export type RoomInboxListParams = z.input<typeof roomInboxListParamsSchema>;
export type RoomMembershipListParams = z.input<typeof roomMembershipListParamsSchema>;
export type UpdateRoomReadStateRequest = z.input<typeof updateRoomReadStateRequestSchema>;
export type UpdateRoomReadStateResponse = z.infer<typeof updateRoomReadStateResponseSchema>;
export type RoomReadReceiptPosition = z.infer<typeof roomReadReceiptPositionSchema>;
export type RoomReadReceiptStateResponse = z.infer<typeof roomReadReceiptStateResponseSchema>;

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

function createCursorPageSchema<TItem extends z.ZodType>(itemSchema: TItem) {
  return z
    .object({
      items: z.array(itemSchema),
      nextCursor: cursorSchema.nullish().transform((cursor) => cursor ?? null),
      hasNext: z.boolean(),
    })
    .superRefine((page, context) => {
      if (page.hasNext && page.nextCursor === null) {
        context.addIssue({
          code: "custom",
          path: ["nextCursor"],
          message: "hasNext가 true이면 nextCursor가 필요합니다.",
        });
      }
    });
}
