import { z } from "zod";
import {
  createCursorPageSchema,
  idempotencyKeySchema,
  instantSchema,
  isoControlCharacterPattern,
  javaStringStripWhitespacePattern,
  opaqueIdSchema,
  roomIdSchema,
  roomNameSchema,
  versionSchema,
} from "./chat-contract-primitives";
import { roomStatusSchema } from "./chat-room-core-contracts";

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
  name: roomNameSchema,
  requestedAt: instantSchema,
});

const pendingRoomCreationRequestResponseSchema = roomCreationRequestResponseBaseSchema.extend({
  code: z.literal("ROOM_CREATION_REQUESTED"),
  status: z.literal("PENDING"),
  roomStatus: z.null(),
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
  roomStatus: roomStatusSchema,
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
  roomStatus: z.null(),
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
  roomStatus: z.null(),
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

export type RoomCreationRequestStatus = z.infer<typeof roomCreationRequestStatusSchema>;
export type RoomCreationRequestResponse = z.infer<typeof roomCreationRequestResponseSchema>;
export type RoomCreationRequestListResponse = z.infer<typeof roomCreationRequestListResponseSchema>;
export type CreateRoomResponse = z.infer<typeof createRoomResponseSchema>;
