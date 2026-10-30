import { z } from "zod";

const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const voteTaskIdSchema = z.string().regex(canonicalUuidPattern, "UUID 형식이어야 합니다.");
const uuidSchema = voteTaskIdSchema;
const timestampSchema = z.string().min(1);

export const taskOptionSchema = z.object({
  id: uuidSchema,
  displayOrder: z.number().int(),
  content: z.string(),
});

export const taskQuestionSchema = z.object({
  id: uuidSchema,
  content: z.string(),
  description: z.string().nullable(),
  options: z.array(taskOptionSchema),
});

const taskSubmissionSummarySchema = z.discriminatedUnion("submitted", [
  z.object({
    submitted: z.literal(false),
    submissionId: z.null(),
    submittedAt: z.null(),
  }),
  z.object({
    submitted: z.literal(true),
    submissionId: uuidSchema,
    submittedAt: timestampSchema,
  }),
]);

export const userTaskSummarySchema = z.object({
  taskId: uuidSchema,
  title: z.string(),
  description: z.string().nullable(),
  openedAt: timestampSchema,
  closesAt: timestampSchema,
  submission: taskSubmissionSummarySchema,
});

export const openTaskListSchema = z.array(userTaskSummarySchema);

export const userTaskDetailSchema = z.object({
  task: z.object({
    id: uuidSchema,
    title: z.string(),
    description: z.string().nullable(),
    question: taskQuestionSchema,
    status: z.string(),
    schedule: z.object({ opensAt: timestampSchema, closesAt: timestampSchema }).nullable(),
    publishedAt: timestampSchema.nullable(),
    openedAt: timestampSchema.nullable(),
    closedAt: timestampSchema.nullable(),
    closureType: z.string().nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  }),
  closesAt: timestampSchema,
  submission: taskSubmissionSummarySchema,
});

export const predictedReasonSchema = z.object({
  id: uuidSchema,
  optionId: uuidSchema,
  reasonOrder: z.number().int(),
  reason: z.string(),
});

export const taskReasonSourceSchema = z.enum(["AI_ACCEPTED", "USER_WRITTEN"]);

export const predictionViewStateSchema = z.enum([
  "TASK_NOT_FOUND",
  "TASK_UNPUBLISHED",
  "TASK_CLOSED",
  "ALREADY_SUBMITTED",
  "PERSONA_NOT_READY",
  "NOT_REQUESTED",
  "PENDING",
  "PROCESSING",
  "REMOTE_PROCESSING",
  "RETRY_WAIT",
  "SUCCEEDED",
  "FAILED",
]);

export const predictionStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "RETRY_WAIT",
  "SUCCEEDED",
  "FAILED",
]);

export const predictionRuntimeStatusSchema = z.object({
  code: z.string(),
  detail: z.string(),
  retryable: z.boolean(),
  maxWaitMinutes: z.number(),
});

export const taskPredictionViewSchema = z.object({
  taskId: uuidSchema,
  state: predictionViewStateSchema,
  personaGenerationId: uuidSchema.nullable(),
  personaId: uuidSchema.nullable(),
  predictionId: uuidSchema.nullable(),
  predictionStatus: predictionStatusSchema.nullable(),
  predictedReasons: z.array(predictedReasonSchema),
  predictionFeatureEnabled: z.boolean(),
  waiting: z.boolean(),
  predictionRequestAllowed: z.boolean(),
  predictionUnavailableReason: z.string().nullable(),
  submissionAllowed: z.boolean(),
  predictedAnswerAllowed: z.boolean(),
  aiAcceptanceAllowed: z.boolean(),
  directAnswerAllowed: z.boolean(),
  retryable: z.boolean(),
  allowedReasonSources: z.array(taskReasonSourceSchema),
  submissionId: uuidSchema.nullable(),
  nextRetryAt: timestampSchema.nullable(),
  completedAt: timestampSchema.nullable(),
  failureCode: z.string().nullable(),
  runtimeStatus: predictionRuntimeStatusSchema.nullable(),
});

export const ensurePredictionResponseSchema = z.object({
  taskId: uuidSchema,
  predictionId: uuidSchema,
  personaGenerationId: uuidSchema,
  personaId: uuidSchema,
  status: predictionStatusSchema,
  created: z.boolean(),
  waiting: z.boolean(),
  predictedAnswerAllowed: z.boolean(),
  directAnswerAllowed: z.boolean(),
  predictedReasons: z.array(predictedReasonSchema),
  nextRetryAt: timestampSchema.nullable(),
  completedAt: timestampSchema.nullable(),
  failureCode: z.string().nullable(),
});

const submissionSelectionSchema = z.object({
  selectedOptionId: uuidSchema,
});

export const aiAcceptedTaskSubmissionSchema = submissionSelectionSchema.extend({
  reasonSource: z.literal("AI_ACCEPTED"),
  predictedReasonId: uuidSchema,
});

export const userWrittenTaskSubmissionSchema = submissionSelectionSchema.extend({
  reasonSource: z.literal("USER_WRITTEN"),
  reason: z
    .string()
    .trim()
    .min(1)
    .refine((value) => Array.from(value).length <= 500, "500자 이하여야 합니다."),
});

export const submitTaskRequestSchema = z.discriminatedUnion("reasonSource", [
  aiAcceptedTaskSubmissionSchema,
  userWrittenTaskSubmissionSchema,
]);

export const taskSubmissionResponseSchema = z.object({
  code: z.literal("TASK_SUBMISSION_CREATED"),
  replayed: z.boolean(),
  taskId: uuidSchema,
  submissionId: uuidSchema,
  submittedAt: timestampSchema,
});

export const myTaskSubmissionSchema = z.object({
  submissionId: uuidSchema,
  taskId: uuidSchema,
  taskTitle: z.string(),
  taskDescription: z.string(),
  personaGenerationId: uuidSchema,
  predictionId: uuidSchema.nullable(),
  submittedAt: timestampSchema,
  questionId: uuidSchema,
  question: taskQuestionSchema,
  selectedOptionId: uuidSchema,
  reasonSource: taskReasonSourceSchema,
  acceptedPredictedReasonId: uuidSchema.nullable(),
  finalReason: z.string(),
});

export type UserTaskSummary = z.infer<typeof userTaskSummarySchema>;
export type UserTaskDetail = z.infer<typeof userTaskDetailSchema>;
export type TaskPredictionView = z.infer<typeof taskPredictionViewSchema>;
export type PredictionRuntimeStatus = z.infer<typeof predictionRuntimeStatusSchema>;
export type EnsurePredictionResponse = z.infer<typeof ensurePredictionResponseSchema>;
export type PredictedReason = z.infer<typeof predictedReasonSchema>;
export type TaskReasonSource = z.infer<typeof taskReasonSourceSchema>;
export type SubmitTaskRequest = z.infer<typeof submitTaskRequestSchema>;
export type TaskSubmissionResponse = z.infer<typeof taskSubmissionResponseSchema>;
export type MyTaskSubmission = z.infer<typeof myTaskSubmissionSchema>;

export function sortTaskOptions<T extends { displayOrder: number }>(options: readonly T[]): T[] {
  return [...options].sort((left, right) => left.displayOrder - right.displayOrder);
}

export function sortPredictedReasons<T extends { reasonOrder: number }>(
  reasons: readonly T[],
): T[] {
  return [...reasons].sort((left, right) => left.reasonOrder - right.reasonOrder);
}
