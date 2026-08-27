import { z } from "zod";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().min(1);
const closureTypeSchema = z.enum(["DEADLINE_REACHED", "EARLY_CLOSED"]);

export const completedTaskSummarySchema = z.object({
  taskId: uuidSchema,
  title: z.string(),
  description: z.string(),
  openedAt: timestampSchema,
  closedAt: timestampSchema,
  closureType: closureTypeSchema,
  mySubmission: z.object({
    submissionId: uuidSchema,
    submittedAt: timestampSchema,
  }),
});

export const completedTaskPageSchema = z.object({
  items: z.array(completedTaskSummarySchema),
  nextCursor: z.string().nullable(),
});

export const myTaskResultSchema = z.object({
  taskId: uuidSchema,
  title: z.string(),
  description: z.string(),
  closedAt: timestampSchema,
  closureType: closureTypeSchema,
  resultVersion: z.number().int().positive(),
  finalizedAt: timestampSchema,
  responseCount: z.number().int().nonnegative(),
  question: z.object({
    id: uuidSchema,
    content: z.string(),
    description: z.string().nullable(),
  }),
  options: z.array(
    z.object({
      id: uuidSchema,
      displayOrder: z.number().int(),
      content: z.string(),
      count: z.number().int().nonnegative(),
      selectedByMe: z.boolean(),
    }),
  ),
  mySubmission: z.object({
    submissionId: uuidSchema,
    selectedOptionId: uuidSchema,
    reasonSource: z.enum(["AI_ACCEPTED", "USER_WRITTEN"]),
    finalReason: z.string(),
    submittedAt: timestampSchema,
  }),
});

export type CompletedTaskSummary = z.infer<typeof completedTaskSummarySchema>;
export type CompletedTaskPage = z.infer<typeof completedTaskPageSchema>;
export type MyTaskResult = z.infer<typeof myTaskResultSchema>;

export function calculateVotePercentage(count: number, responseCount: number): number {
  return responseCount === 0 ? 0 : (count / responseCount) * 100;
}
