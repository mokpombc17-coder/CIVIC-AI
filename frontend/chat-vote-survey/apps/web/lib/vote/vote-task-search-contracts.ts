import { z } from "zod";
import { voteTaskIdSchema } from "./vote-task-contracts";

const timestampSchema = z.string().min(1);
const closureTypeSchema = z.enum(["DEADLINE_REACHED", "EARLY_CLOSED"]);

const searchTaskSubmissionSchema = z.object({
  submissionId: voteTaskIdSchema,
  submittedAt: timestampSchema,
});

const searchTaskBaseSchema = z.object({
  taskId: voteTaskIdSchema,
  title: z.string(),
  description: z.string().nullable(),
  openedAt: timestampSchema,
  closesAt: timestampSchema,
});

export const openSearchTaskSchema = searchTaskBaseSchema.extend({
  taskStatus: z.literal("OPEN"),
  closedAt: z.null(),
  closureType: z.null(),
  mySubmission: searchTaskSubmissionSchema.nullable(),
  resultAvailable: z.literal(false),
});

export const closedSearchTaskSchema = searchTaskBaseSchema.extend({
  taskStatus: z.literal("CLOSED"),
  closedAt: timestampSchema,
  closureType: closureTypeSchema,
  mySubmission: searchTaskSubmissionSchema,
  resultAvailable: z.boolean(),
});

export const searchTaskItemSchema = z.discriminatedUnion("taskStatus", [
  openSearchTaskSchema,
  closedSearchTaskSchema,
]);

export const searchTaskPageSchema = z.object({
  items: z.array(searchTaskItemSchema),
  nextCursor: z.string().nullable(),
});

export const searchTaskParamsSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .refine((value) => Array.from(value).length <= 200, "검색어는 200자 이하여야 합니다."),
  cursor: z.string().min(1).optional(),
  size: z.number().int().min(1).max(100).default(20),
});

export type SearchTaskItem = z.infer<typeof searchTaskItemSchema>;
export type SearchTaskPage = z.infer<typeof searchTaskPageSchema>;
export type SearchTaskParams = z.input<typeof searchTaskParamsSchema>;
