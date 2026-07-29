import { z } from "zod";

const opaqueIdSchema = z.string().min(1);
const versionSchema = z.number().int().nonnegative();
const instantSchema = z.string().datetime({ offset: true });
const nullableInstantSchema = instantSchema.nullable();
const cursorSchema = z.string().min(1);

export const roomIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "roomId 형식이 올바르지 않습니다.");
export const roomNameSchema = z.string().trim().min(1).max(100);
export const idempotencyKeySchema = z.string().uuid();

export const roomVisibilitySchema = z.enum(["LISTED", "UNLISTED"]);
export const joinPolicySchema = z.enum(["OPEN", "INVITE_ONLY"]);
export const roomStatusSchema = z.enum(["ACTIVE", "CLOSED"]);
export const membershipRoleSchema = z.enum(["OWNER", "MEMBER"]);
export const membershipStatusSchema = z.enum(["ACTIVE", "LEFT", "BANNED"]);
export const roomParticipationStatusSchema = z.enum([
  "ACTIVE",
  "LEFT",
  "BANNED",
  "NOT_JOINED",
  "ROOM_CLOSED",
]);

export const roomMembershipSchema = z.object({
  membershipId: opaqueIdSchema,
  roomId: roomIdSchema,
  userId: opaqueIdSchema,
  role: membershipRoleSchema,
  status: membershipStatusSchema,
  joinedAt: instantSchema,
  leftAt: nullableInstantSchema,
  bannedAt: nullableInstantSchema,
  version: versionSchema,
});

export const publicRoomListItemSchema = z.object({
  roomId: roomIdSchema,
  name: roomNameSchema,
  ownerUserId: opaqueIdSchema,
  status: roomStatusSchema,
  visibility: roomVisibilitySchema,
  joinPolicy: joinPolicySchema,
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

export const roomMembershipListItemSchema = z.object({
  membershipId: opaqueIdSchema,
  userId: opaqueIdSchema,
  role: membershipRoleSchema,
  status: membershipStatusSchema,
  joinedAt: instantSchema,
  leftAt: nullableInstantSchema,
  bannedAt: nullableInstantSchema,
  version: versionSchema,
});

export const publicRoomListResponseSchema = createCursorPageSchema(publicRoomListItemSchema);
export const myRoomListResponseSchema = createCursorPageSchema(myRoomListItemSchema);
export const roomMembershipListResponseSchema = createCursorPageSchema(
  roomMembershipListItemSchema,
);

export const createRoomRequestSchema = z.object({
  name: roomNameSchema,
  visibility: roomVisibilitySchema,
  joinPolicy: joinPolicySchema,
});

export const targetUserRequestSchema = z.object({
  targetUserId: z.string().trim().min(1),
});

const commandResponseBaseSchema = z.object({
  clientRequestId: idempotencyKeySchema,
  replayed: z.boolean(),
  roomId: roomIdSchema,
});

export const createRoomResponseSchema = commandResponseBaseSchema.extend({
  code: z.literal("ROOM_CREATED"),
  ownerMembershipId: opaqueIdSchema,
  ownerUserId: opaqueIdSchema,
  roomVersion: versionSchema,
  ownerMembershipVersion: versionSchema,
});

const membershipCommandResponseFields = {
  membershipId: opaqueIdSchema,
  membershipUserId: opaqueIdSchema,
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
  previousOwnerUserId: opaqueIdSchema,
  newOwnerUserId: opaqueIdSchema,
  previousOwnerMembershipId: opaqueIdSchema,
  newOwnerMembershipId: opaqueIdSchema,
  roomVersion: versionSchema,
  previousOwnerMembershipVersion: versionSchema,
  newOwnerMembershipVersion: versionSchema,
});

const memberBanCommandResponseFields = {
  targetUserId: opaqueIdSchema,
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
  ownerUserId: opaqueIdSchema,
  roomVersion: versionSchema,
  ownerMembershipVersion: versionSchema,
});

export const cursorPaginationParamsSchema = z.object({
  cursor: cursorSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const roomMembershipListParamsSchema = cursorPaginationParamsSchema.extend({
  status: membershipStatusSchema.optional(),
});

export type RoomVisibility = z.infer<typeof roomVisibilitySchema>;
export type JoinPolicy = z.infer<typeof joinPolicySchema>;
export type RoomStatus = z.infer<typeof roomStatusSchema>;
export type MembershipRole = z.infer<typeof membershipRoleSchema>;
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;
export type RoomParticipationStatus = z.infer<typeof roomParticipationStatusSchema>;
export type RoomMembership = z.infer<typeof roomMembershipSchema>;
export type PublicRoomListItem = z.infer<typeof publicRoomListItemSchema>;
export type RoomDetails = z.infer<typeof roomDetailsSchema>;
export type MyRoomListItem = z.infer<typeof myRoomListItemSchema>;
export type RoomMembershipListItem = z.infer<typeof roomMembershipListItemSchema>;
export type PublicRoomListResponse = z.infer<typeof publicRoomListResponseSchema>;
export type MyRoomListResponse = z.infer<typeof myRoomListResponseSchema>;
export type RoomMembershipListResponse = z.infer<typeof roomMembershipListResponseSchema>;
export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;
export type TargetUserRequest = z.infer<typeof targetUserRequestSchema>;
export type CreateRoomResponse = z.infer<typeof createRoomResponseSchema>;
export type JoinRoomResponse = z.infer<typeof joinRoomResponseSchema>;
export type LeaveRoomResponse = z.infer<typeof leaveRoomResponseSchema>;
export type TransferRoomOwnershipResponse = z.infer<typeof transferRoomOwnershipResponseSchema>;
export type BanRoomMemberResponse = z.infer<typeof banRoomMemberResponseSchema>;
export type UnbanRoomMemberResponse = z.infer<typeof unbanRoomMemberResponseSchema>;
export type CloseRoomResponse = z.infer<typeof closeRoomResponseSchema>;
export type CursorPaginationParams = z.input<typeof cursorPaginationParamsSchema>;
export type RoomMembershipListParams = z.input<typeof roomMembershipListParamsSchema>;

function createCursorPageSchema<TItem extends z.ZodType>(itemSchema: TItem) {
  return z
    .object({
      items: z.array(itemSchema),
      nextCursor: cursorSchema.nullable(),
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
