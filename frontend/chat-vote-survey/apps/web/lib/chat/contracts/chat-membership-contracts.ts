import { z } from "zod";
import {
  commandResponseBaseSchema,
  createCursorPageSchema,
  cursorPaginationParamsSchema,
  instantSchema,
  javaStringStripWhitespacePattern,
  nonnegativeSequenceSchema,
  nullableInstantSchema,
  opaqueIdSchema,
  roomIdSchema,
  versionSchema,
} from "./chat-contract-primitives";

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

export const roomMembershipListItemSchema = z.object({
  membershipId: opaqueIdSchema,
  displayName: membershipDisplayNameSchema,
  userLabel: z.string().optional(),
  enteredAfterMessageSequence: nonnegativeSequenceSchema.optional(),
  imageUrl: z.string().nullable(),
  profileVersion: z.number().int().positive(),
  role: membershipRoleSchema,
  status: membershipStatusSchema,
  joinedAt: instantSchema,
  leftAt: nullableInstantSchema,
  bannedAt: nullableInstantSchema,
  version: versionSchema,
});

export const roomMembershipListResponseSchema = createCursorPageSchema(
  roomMembershipListItemSchema,
);

export const roomParticipationOriginSchema = z.enum(["NORMAL", "LEGACY"]);
export const roomParticipationHistoryStatusSchema = z.enum(["ACTIVE", "ENDED"]);
export const roomParticipationEndReasonSchema = z.enum(["LEFT", "BANNED", "ROOM_CLOSED"]);
export const roomParticipationListItemSchema = z
  .object({
    participationId: opaqueIdSchema,
    membershipId: opaqueIdSchema,
    origin: roomParticipationOriginSchema,
    status: roomParticipationHistoryStatusSchema,
    enteredAfterMessageSequence: nonnegativeSequenceSchema,
    endedAfterMessageSequence: nonnegativeSequenceSchema.nullable(),
    displayName: membershipDisplayNameSchema,
    userLabel: z.string().min(1),
    imageUrl: z.string().nullable(),
    profileVersion: z.number().int().positive(),
    joinedAt: instantSchema,
    endedAt: nullableInstantSchema,
    endReason: roomParticipationEndReasonSchema.nullable(),
    version: versionSchema,
  })
  .superRefine((participation, context) => {
    if (participation.status === "ACTIVE") {
      for (const field of ["endedAfterMessageSequence", "endedAt", "endReason"] as const) {
        if (participation[field] !== null) {
          context.addIssue({
            code: "custom",
            path: [field],
            message: `ACTIVE participation의 ${field}은 null이어야 합니다.`,
          });
        }
      }
      return;
    }

    if (participation.endedAt === null) {
      context.addIssue({
        code: "custom",
        path: ["endedAt"],
        message: "ENDED participation에는 endedAt이 필요합니다.",
      });
    }
    if (participation.endReason === null) {
      context.addIssue({
        code: "custom",
        path: ["endReason"],
        message: "ENDED participation에는 endReason이 필요합니다.",
      });
    }
    if (participation.origin === "NORMAL" && participation.endedAfterMessageSequence === null) {
      context.addIssue({
        code: "custom",
        path: ["endedAfterMessageSequence"],
        message: "NORMAL ENDED participation에는 종료 sequence가 필요합니다.",
      });
    }
  });
export const roomParticipationListResponseSchema = z.object({
  items: z.array(roomParticipationListItemSchema),
});

export const targetMembershipRequestSchema = z
  .object({
    targetMembershipId: z.string().trim().min(1),
  })
  .strict();

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

export const roomMembershipListParamsSchema = cursorPaginationParamsSchema.extend({
  status: membershipStatusSchema.optional(),
});

export type MembershipRole = z.infer<typeof membershipRoleSchema>;
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;
export type RoomMembership = z.infer<typeof roomMembershipSchema>;
export type RoomMembershipListItem = z.infer<typeof roomMembershipListItemSchema>;
export type RoomMembershipListResponse = z.infer<typeof roomMembershipListResponseSchema>;
export type RoomParticipationOrigin = z.infer<typeof roomParticipationOriginSchema>;
export type RoomParticipationHistoryStatus = z.infer<typeof roomParticipationHistoryStatusSchema>;
export type RoomParticipationEndReason = z.infer<typeof roomParticipationEndReasonSchema>;
export type RoomParticipationListItem = z.infer<typeof roomParticipationListItemSchema>;
export type RoomParticipationListResponse = z.infer<typeof roomParticipationListResponseSchema>;
export type TargetMembershipRequest = z.infer<typeof targetMembershipRequestSchema>;
export type JoinRoomResponse = z.infer<typeof joinRoomResponseSchema>;
export type LeaveRoomResponse = z.infer<typeof leaveRoomResponseSchema>;
export type TransferRoomOwnershipResponse = z.infer<typeof transferRoomOwnershipResponseSchema>;
export type BanRoomMemberResponse = z.infer<typeof banRoomMemberResponseSchema>;
export type UnbanRoomMemberResponse = z.infer<typeof unbanRoomMemberResponseSchema>;
export type RoomMembershipListParams = z.input<typeof roomMembershipListParamsSchema>;
