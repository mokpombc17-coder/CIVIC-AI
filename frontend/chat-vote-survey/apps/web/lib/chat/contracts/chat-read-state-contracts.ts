import { z } from "zod";
import { isStrictlyAscendingByMembershipId } from "../chat-membership-id-order";
import {
  instantSchema,
  nonnegativeSequenceSchema,
  opaqueIdSchema,
  roomIdSchema,
  safeNonnegativeIntegerSchema,
} from "./chat-contract-primitives";

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

export type UpdateRoomReadStateRequest = z.input<typeof updateRoomReadStateRequestSchema>;
export type UpdateRoomReadStateResponse = z.infer<typeof updateRoomReadStateResponseSchema>;
export type RoomReadReceiptPosition = z.infer<typeof roomReadReceiptPositionSchema>;
export type RoomReadReceiptStateResponse = z.infer<typeof roomReadReceiptStateResponseSchema>;
