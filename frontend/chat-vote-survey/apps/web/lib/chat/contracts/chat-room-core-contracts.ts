import { z } from "zod";
import {
  commandResponseBaseSchema,
  createCursorPageSchema,
  cursorPaginationParamsSchema,
  cursorSchema,
  forbiddenC0ControlCharacterPattern,
  instantSchema,
  isoControlCharacterPattern,
  javaStringStripWhitespacePattern,
  nonnegativeSequenceSchema,
  nullableInstantSchema,
  opaqueIdSchema,
  positiveMessageVersionSchema,
  positiveSequenceSchema,
  roomIdSchema,
  roomNameSchema,
  versionSchema,
} from "./chat-contract-primitives";
import {
  membershipRoleSchema,
  membershipStatusSchema,
  roomMembershipSchema,
} from "./chat-membership-contracts";

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
export const roomCategorySummarySchema = z.object({
  categoryId: roomCategoryIdSchema,
  name: z.string().min(1),
});
export const roomCategorySummariesSchema = z.array(roomCategorySummarySchema).min(1).max(5);
export const roomStatusSchema = z.enum(["ACTIVE", "CLOSED"]);
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

export const roomSettingsSchema = z.object({
  name: roomNameSchema,
  description: roomDescriptionSchema,
  categoryIds: roomCategoryIdsSchema,
  visibility: roomVisibilitySchema,
  joinPolicy: joinPolicySchema,
});

const roomCategorySummaryMismatchIssue = {
  path: ["categorySummaries"],
  message: "categoryIds와 categorySummaries의 categoryId 집합은 같아야 합니다.",
};

function hasMatchingRoomCategoryIds(room: {
  categoryIds: readonly string[];
  categorySummaries: readonly { categoryId: string }[];
}): boolean {
  const categoryIds = new Set(room.categoryIds);
  const summaryIds = new Set(room.categorySummaries.map(({ categoryId }) => categoryId));

  return categoryIds.size === summaryIds.size && [...categoryIds].every((id) => summaryIds.has(id));
}

const roomListItemBaseSchema = roomSettingsSchema.extend({
  roomId: roomIdSchema,
  ownerMembershipId: opaqueIdSchema,
  status: roomStatusSchema,
  activeMemberCount: z.number().int().nonnegative(),
  createdAt: instantSchema,
  version: versionSchema,
});

export const publicRoomListItemSchema = roomListItemBaseSchema
  .extend({
    categorySummaries: roomCategorySummariesSchema,
  })
  .refine(hasMatchingRoomCategoryIds, roomCategorySummaryMismatchIssue);

export const roomDetailsSchema = roomListItemBaseSchema
  .extend({
    categorySummaries: roomCategorySummariesSchema,
    closedAt: nullableInstantSchema,
    participationStatus: roomParticipationStatusSchema,
    myMembership: roomMembershipSchema.nullable(),
  })
  .refine(hasMatchingRoomCategoryIds, roomCategorySummaryMismatchIssue);

export const myRoomListItemSchema = roomListItemBaseSchema.extend({
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
    categorySummaries: roomCategorySummariesSchema,
    readThroughSequence: nonnegativeSequenceSchema,
    unreadCount: z.number().int().nonnegative(),
    unreadCountCapped: z.boolean(),
    lastMessage: roomInboxLastMessageSchema.nullable(),
    lastActivityAt: instantSchema,
  })
  .superRefine((room, context) => {
    if (!hasMatchingRoomCategoryIds(room)) {
      context.addIssue({
        code: "custom",
        ...roomCategorySummaryMismatchIssue,
      });
    }

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

export const publicRoomListResponseSchema = createCursorPageSchema(publicRoomListItemSchema);
export const myRoomListResponseSchema = createCursorPageSchema(myRoomListItemSchema);
export const roomInboxListResponseSchema = createCursorPageSchema(roomInboxListItemSchema);

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

export const updateRoomSettingsResponseSchema = commandResponseBaseSchema.extend({
  code: z.enum(["ROOM_SETTINGS_UPDATED", "ROOM_SETTINGS_UNCHANGED"]),
  ...roomSettingsSchema.shape,
  roomVersion: versionSchema,
});

export const closeRoomResponseSchema = commandResponseBaseSchema.extend({
  code: z.enum(["CLOSED", "ALREADY_CLOSED"]),
  ownerMembershipId: opaqueIdSchema,
  roomVersion: versionSchema,
  ownerMembershipVersion: versionSchema,
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

export type RoomVisibility = z.infer<typeof roomVisibilitySchema>;
export type JoinPolicy = z.infer<typeof joinPolicySchema>;
export type RoomCategoryId = z.infer<typeof roomCategoryIdSchema>;
export type RoomCategoryIds = readonly RoomCategoryId[];
export type RoomCategorySummary = z.infer<typeof roomCategorySummarySchema>;
export type RoomStatus = z.infer<typeof roomStatusSchema>;
export type RoomParticipationStatus = z.infer<typeof roomParticipationStatusSchema>;
export type RoomSettings = z.infer<typeof roomSettingsSchema>;
export type PublicRoomListItem = z.infer<typeof publicRoomListItemSchema>;
export type RoomDetails = z.infer<typeof roomDetailsSchema>;
export type MyRoomListItem = z.infer<typeof myRoomListItemSchema>;
export type RoomInboxLastMessage = z.infer<typeof roomInboxLastMessageSchema>;
export type RoomInboxListItem = z.infer<typeof roomInboxListItemSchema>;
export type PublicRoomListResponse = z.infer<typeof publicRoomListResponseSchema>;
export type MyRoomListResponse = z.infer<typeof myRoomListResponseSchema>;
export type RoomInboxListResponse = z.infer<typeof roomInboxListResponseSchema>;
export type CreateRoomRequest = z.input<typeof createRoomRequestSchema>;
export type UpdateRoomSettingsRequest = z.input<typeof updateRoomSettingsRequestSchema>;
export type UpdateRoomSettingsResponse = z.infer<typeof updateRoomSettingsResponseSchema>;
export type CloseRoomResponse = z.infer<typeof closeRoomResponseSchema>;
export type PublicRoomListParams = z.input<typeof publicRoomListParamsSchema>;
export type RoomInboxListParams = z.input<typeof roomInboxListParamsSchema>;
