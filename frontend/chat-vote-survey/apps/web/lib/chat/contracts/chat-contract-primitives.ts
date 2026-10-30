import { z } from "zod";

export const opaqueIdSchema = z.string().min(1);
export const versionSchema = z.number().int().nonnegative();
export const instantSchema = z.string().datetime({ offset: true });
export const nullableInstantSchema = instantSchema.nullable();
export const cursorSchema = z.string().min(1);
export const positiveSequenceSchema = z.number().int().min(1);
export const nonnegativeSequenceSchema = z.number().int().nonnegative();
export const safeNonnegativeIntegerSchema = z
  .number()
  .refine((value) => Number.isSafeInteger(value) && value >= 0, {
    message: "0 이상의 안전한 정수여야 합니다.",
  });
export const positiveMessageVersionSchema = z.number().int().positive();
export const forbiddenC0ControlCharacterPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u;
export const isoControlCharacterPattern = /[\u0000-\u001F\u007F-\u009F]/u;
export const javaStringStripWhitespacePattern =
  /^[\u0009-\u000D\u001C-\u001F\u0020\u1680\u2000-\u2006\u2008-\u200A\u2028\u2029\u205F\u3000]+|[\u0009-\u000D\u001C-\u001F\u0020\u1680\u2000-\u2006\u2008-\u200A\u2028\u2029\u205F\u3000]+$/gu;

export const roomIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "roomId 형식이 올바르지 않습니다.");
export const roomNameSchema = z.string().trim().min(1).max(100);
export const idempotencyKeySchema = z.string().uuid();

export const commandResponseBaseSchema = z.object({
  clientRequestId: idempotencyKeySchema,
  replayed: z.boolean(),
  roomId: roomIdSchema,
});

export const cursorPaginationParamsSchema = z.object({
  cursor: cursorSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export type CursorPaginationParams = z.input<typeof cursorPaginationParamsSchema>;

export function createCursorPageSchema<TItem extends z.ZodType>(itemSchema: TItem) {
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
