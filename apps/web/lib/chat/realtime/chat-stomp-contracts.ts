import { z } from "zod";
import {
  activeChatMessageSchema,
  chatMessageSendContentSchema,
  deletedChatMessageSchema,
  membershipRoleSchema,
  membershipStatusSchema,
  roomIdSchema,
  roomSettingsSchema,
  roomStatusSchema,
} from "../chat-room-contracts";

const opaqueIdSchema = z.string().min(1);
const requestIdSchema = z.string().uuid();
const versionSchema = z.number().int().nonnegative();
const positiveSequenceSchema = z.number().int().positive();
const nonnegativeSequenceSchema = z.number().int().nonnegative();
const instantSchema = z.string().datetime({ offset: true });

export const chatRoomSubscriptionSyncRequestSchema = z.object({
  requestId: requestIdSchema,
});

export const chatMessageSendRequestSchema = z.object({
  clientMessageId: requestIdSchema,
  content: chatMessageSendContentSchema,
});

export const chatMessageEditRequestSchema = z.object({
  clientMutationId: requestIdSchema,
  messageId: opaqueIdSchema,
  content: chatMessageSendContentSchema,
});

export const chatMessageDeleteRequestSchema = z.object({
  clientMutationId: requestIdSchema,
  messageId: opaqueIdSchema,
});

export const chatRoomSubscriptionsReadySchema = z.object({
  status: z.literal("READY"),
  eventType: z.literal("ROOM_SUBSCRIPTIONS_READY"),
  requestId: requestIdSchema,
  roomId: roomIdSchema,
  messageVisibleAfterSequence: nonnegativeSequenceSchema,
  watermarkSequence: nonnegativeSequenceSchema,
});

const chatRoomSubscriptionSyncRejectedBaseSchema = z.object({
  status: z.literal("REJECTED"),
  eventType: z.literal("ROOM_SUBSCRIPTION_SYNC_REJECTED"),
  requestId: requestIdSchema,
  roomId: roomIdSchema,
});

export const chatRoomSubscriptionSyncRejectedSchema = z.union([
  chatRoomSubscriptionSyncRejectedBaseSchema.extend({
    code: z.enum([
      "INVALID_SYNC_REQUEST",
      "ROOM_SUBSCRIPTIONS_NOT_READY",
      "ROOM_SUBSCRIPTION_FORBIDDEN",
      "ROOM_SUBSCRIPTION_STALE",
    ]),
    retryable: z.literal(false),
  }),
  chatRoomSubscriptionSyncRejectedBaseSchema.extend({
    code: z.enum(["ROOM_AUTHORIZATION_UNAVAILABLE", "ROOM_SUBSCRIPTION_SYNC_UNAVAILABLE"]),
    retryable: z.literal(true),
  }),
]);

export const chatSubscriptionRejectionSchema = z.object({
  status: z.literal("REJECTED"),
  code: z.string().min(1),
  destination: z.string().min(1),
});

const chatRoomInboxSourceEventIdsSchema = z
  .array(opaqueIdSchema)
  .min(1)
  .max(100)
  .refine((sourceEventIds) => new Set(sourceEventIds).size === sourceEventIds.length, {
    message: "sourceEventIds에는 중복 값이 없어야 합니다.",
  });

const chatRoomInboxEventBaseSchema = z.object({
  eventVersion: z.literal(1),
  eventId: requestIdSchema,
  eventType: z.literal("ROOM_INBOX_INVALIDATED"),
  roomId: roomIdSchema,
  emittedAt: instantSchema,
  sourceEventIds: chatRoomInboxSourceEventIdsSchema,
});

const chatRoomInboxNotificationHintSchema = z.object({
  messageId: opaqueIdSchema,
  messageVersion: z.number().int().positive(),
  senderUserId: opaqueIdSchema,
  messageCreatedAt: instantSchema,
  preview: z.string(),
  previewTruncated: z.boolean(),
});

const chatRoomInboxCreatedEventSchema = chatRoomInboxEventBaseSchema
  .extend({
    cause: z.literal("MESSAGE_CREATED"),
    roomNameHint: z.string().trim().min(1),
    coalescedCreateCount: z.number().int().positive(),
    notificationHint: chatRoomInboxNotificationHintSchema,
  })
  .refine((event) => event.coalescedCreateCount === event.sourceEventIds.length, {
    message: "coalescedCreateCount는 sourceEventIds 개수와 같아야 합니다.",
    path: ["coalescedCreateCount"],
  });

const chatRoomInboxDeletedEventSchema = chatRoomInboxEventBaseSchema.extend({
  cause: z.literal("MESSAGE_DELETED"),
  roomNameHint: z.null(),
  coalescedCreateCount: z.null(),
  notificationHint: z.null(),
});

export const chatRoomInboxEventSchema = z.union([
  chatRoomInboxCreatedEventSchema,
  chatRoomInboxDeletedEventSchema,
]);

export const chatMessageCommandResultSchema = z.discriminatedUnion("status", [
  z.object({
    clientMessageId: requestIdSchema,
    status: z.literal("ACCEPTED"),
    code: z.null(),
    retryable: z.literal(false),
    retryAfterMs: z.null(),
    messageId: opaqueIdSchema,
    roomSequence: positiveSequenceSchema,
  }),
  z.object({
    clientMessageId: requestIdSchema,
    status: z.literal("DUPLICATE"),
    code: z.null(),
    retryable: z.literal(false),
    retryAfterMs: z.null(),
    messageId: opaqueIdSchema,
    roomSequence: positiveSequenceSchema,
  }),
  z.object({
    clientMessageId: requestIdSchema,
    status: z.literal("REJECTED"),
    code: z.string().min(1),
    retryable: z.boolean(),
    retryAfterMs: z.number().int().nonnegative().nullable(),
    messageId: z.null(),
    roomSequence: z.null(),
  }),
  z.object({
    clientMessageId: requestIdSchema,
    status: z.literal("FAILED"),
    code: z.string().min(1),
    retryable: z.boolean(),
    retryAfterMs: z.number().int().nonnegative().nullable(),
    messageId: z.null(),
    roomSequence: z.null(),
  }),
]);

export const chatMessageMutationCommandTypeSchema = z.enum(["EDIT_MESSAGE", "DELETE_MESSAGE"]);

const chatMessageMutationCommandResultBaseSchema = z.object({
  clientMessageId: z.null(),
  clientMutationId: requestIdSchema,
  replayed: z.boolean(),
});

const chatMessageMutationSuccessBaseSchema = chatMessageMutationCommandResultBaseSchema.extend({
  code: z.null(),
  retryable: z.literal(false),
  retryAfterMs: z.null(),
  messageId: opaqueIdSchema,
  roomSequence: positiveSequenceSchema,
  messageVersion: z.number().int().positive(),
});

const chatMessageEditSuccessResultSchema = chatMessageMutationSuccessBaseSchema.extend({
  commandType: z.literal("EDIT_MESSAGE"),
  status: z.enum(["UPDATED", "UNCHANGED"]),
  messageState: z.literal("ACTIVE"),
});

const chatMessageDeleteSuccessResultSchema = chatMessageMutationSuccessBaseSchema.extend({
  commandType: z.literal("DELETE_MESSAGE"),
  status: z.enum(["DELETED", "ALREADY_DELETED"]),
  messageState: z.literal("DELETED_BY_AUTHOR"),
});

const chatMessageDeletedRejectionResultSchema = chatMessageMutationCommandResultBaseSchema.extend({
  commandType: chatMessageMutationCommandTypeSchema,
  status: z.literal("REJECTED"),
  code: z.literal("MESSAGE_DELETED"),
  retryable: z.literal(false),
  retryAfterMs: z.null(),
  messageId: opaqueIdSchema,
  roomSequence: positiveSequenceSchema,
  messageVersion: z.number().int().positive(),
  messageState: z.literal("DELETED_BY_AUTHOR"),
});

const chatMessageMutationRejectionResultSchema = chatMessageMutationCommandResultBaseSchema.extend({
  commandType: chatMessageMutationCommandTypeSchema,
  status: z.literal("REJECTED"),
  code: z
    .string()
    .min(1)
    .refine((code) => code !== "MESSAGE_DELETED"),
  retryable: z.boolean(),
  retryAfterMs: z.number().int().nonnegative().nullable(),
  messageId: opaqueIdSchema.nullable(),
  roomSequence: z.null(),
  messageVersion: z.null(),
  messageState: z.null(),
});

const chatMessageMutationFailedResultSchema = chatMessageMutationCommandResultBaseSchema.extend({
  commandType: chatMessageMutationCommandTypeSchema,
  status: z.literal("FAILED"),
  code: z.string().min(1),
  retryable: z.boolean(),
  retryAfterMs: z.null(),
  messageId: opaqueIdSchema.nullable(),
  roomSequence: z.null(),
  messageVersion: z.null(),
  messageState: z.null(),
});

export const chatMessageMutationCommandResultSchema = z.union([
  chatMessageEditSuccessResultSchema,
  chatMessageDeleteSuccessResultSchema,
  chatMessageDeletedRejectionResultSchema,
  chatMessageMutationRejectionResultSchema,
  chatMessageMutationFailedResultSchema,
]);

export const chatMessageEventSchema = z.discriminatedUnion("eventType", [
  z.object({
    eventVersion: z.literal(1),
    eventType: z.literal("CHAT_MESSAGE_CREATED"),
    payload: activeChatMessageSchema.refine((message) => message.messageVersion === 1, {
      message: "생성 메시지의 messageVersion은 1이어야 합니다.",
      path: ["messageVersion"],
    }),
  }),
  z.object({
    eventVersion: z.literal(1),
    eventType: z.literal("CHAT_MESSAGE_UPDATED"),
    payload: activeChatMessageSchema,
  }),
  z.object({
    eventVersion: z.literal(1),
    eventType: z.literal("CHAT_MESSAGE_DELETED"),
    payload: deletedChatMessageSchema,
  }),
]);

export const chatRoomEventMemberStateSchema = z.object({
  membershipId: opaqueIdSchema,
  userId: opaqueIdSchema,
  role: membershipRoleSchema,
  status: membershipStatusSchema,
  membershipVersion: versionSchema,
});

const chatRoomEventEnvelopeBaseSchema = z.object({
  eventVersion: z.literal(1),
  eventId: opaqueIdSchema,
  emittedAt: instantSchema,
});

const chatRoomEventPayloadBaseSchema = z.object({
  roomId: roomIdSchema,
  roomVersion: versionSchema,
  roomStatus: roomStatusSchema,
});

const chatRoomOwnerEventSchema = chatRoomEventEnvelopeBaseSchema.extend({
  eventType: z.enum(["ROOM_CREATED", "ROOM_CLOSED"]),
  payload: chatRoomEventPayloadBaseSchema.extend({
    owner: chatRoomEventMemberStateSchema,
  }),
});

const chatRoomMemberEventSchema = chatRoomEventEnvelopeBaseSchema.extend({
  eventType: z.enum([
    "ROOM_MEMBER_JOINED",
    "ROOM_MEMBER_REJOINED",
    "ROOM_MEMBER_LEFT",
    "ROOM_MEMBER_BANNED",
    "ROOM_MEMBER_UNBANNED",
  ]),
  payload: chatRoomEventPayloadBaseSchema.extend({
    member: chatRoomEventMemberStateSchema,
  }),
});

const chatRoomOwnershipTransferredEventSchema = chatRoomEventEnvelopeBaseSchema.extend({
  eventType: z.literal("ROOM_OWNERSHIP_TRANSFERRED"),
  payload: chatRoomEventPayloadBaseSchema.extend({
    previousOwner: chatRoomEventMemberStateSchema,
    newOwner: chatRoomEventMemberStateSchema,
  }),
});

const chatRoomSettingsUpdatedEventSchema = chatRoomEventEnvelopeBaseSchema.extend({
  eventType: z.literal("ROOM_SETTINGS_UPDATED"),
  payload: chatRoomEventPayloadBaseSchema.extend(roomSettingsSchema.shape),
});

export const chatRoomEventEnvelopeSchema = z.union([
  chatRoomOwnerEventSchema,
  chatRoomMemberEventSchema,
  chatRoomOwnershipTransferredEventSchema,
  chatRoomSettingsUpdatedEventSchema,
]);

export const chatSystemEventSchema = z.union([
  chatRoomSubscriptionsReadySchema,
  chatRoomSubscriptionSyncRejectedSchema,
  chatSubscriptionRejectionSchema,
  chatRoomEventEnvelopeSchema,
]);

export type ChatRoomSubscriptionSyncRequest = z.infer<typeof chatRoomSubscriptionSyncRequestSchema>;
export type ChatMessageSendRequest = z.infer<typeof chatMessageSendRequestSchema>;
export type ChatMessageEditRequest = z.infer<typeof chatMessageEditRequestSchema>;
export type ChatMessageDeleteRequest = z.infer<typeof chatMessageDeleteRequestSchema>;
export type ChatRoomSubscriptionsReady = z.infer<typeof chatRoomSubscriptionsReadySchema>;
export type ChatRoomSubscriptionSyncRejected = z.infer<
  typeof chatRoomSubscriptionSyncRejectedSchema
>;
export type ChatSubscriptionRejection = z.infer<typeof chatSubscriptionRejectionSchema>;
export type ChatRoomInboxEvent = z.infer<typeof chatRoomInboxEventSchema>;
export type ChatMessageCommandResult = z.infer<typeof chatMessageCommandResultSchema>;
export type ChatMessageMutationCommandType = z.infer<typeof chatMessageMutationCommandTypeSchema>;
export type ChatMessageMutationCommandResult = z.infer<
  typeof chatMessageMutationCommandResultSchema
>;
export type ChatMessageEvent = z.infer<typeof chatMessageEventSchema>;
export type ChatRoomEventMemberState = z.infer<typeof chatRoomEventMemberStateSchema>;
export type ChatRoomEventEnvelope = z.infer<typeof chatRoomEventEnvelopeSchema>;
export type ChatSystemEvent = z.infer<typeof chatSystemEventSchema>;

export function parseChatRoomSubscriptionsReady(body: string): ChatRoomSubscriptionsReady | null {
  return parseChatStompBody(body, chatRoomSubscriptionsReadySchema);
}

export function parseChatRoomSubscriptionSyncRejected(
  body: string,
): ChatRoomSubscriptionSyncRejected | null {
  return parseChatStompBody(body, chatRoomSubscriptionSyncRejectedSchema);
}

export function parseChatSubscriptionRejection(body: string): ChatSubscriptionRejection | null {
  return parseChatStompBody(body, chatSubscriptionRejectionSchema);
}

export function parseChatRoomInboxEvent(body: string): ChatRoomInboxEvent | null {
  return parseChatStompBody(body, chatRoomInboxEventSchema);
}

export function parseChatMessageCommandResult(body: string): ChatMessageCommandResult | null {
  return parseChatStompBody(body, chatMessageCommandResultSchema);
}

export function parseChatMessageMutationCommandResult(
  body: string,
): ChatMessageMutationCommandResult | null {
  return parseChatStompBody(body, chatMessageMutationCommandResultSchema);
}

export function parseChatMessageEvent(body: string): ChatMessageEvent | null {
  return parseChatStompBody(body, chatMessageEventSchema);
}

export function parseChatRoomEventEnvelope(body: string): ChatRoomEventEnvelope | null {
  return parseChatStompBody(body, chatRoomEventEnvelopeSchema);
}

export function parseChatSystemEvent(body: string): ChatSystemEvent | null {
  return parseChatStompBody(body, chatSystemEventSchema);
}

function parseChatStompBody<TSchema extends z.ZodType>(
  body: string,
  schema: TSchema,
): z.output<TSchema> | null {
  let value: unknown;

  try {
    value = JSON.parse(body);
  } catch {
    return null;
  }

  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}
