import { z } from "zod";

const uuidSchema = z.string().uuid();
const iso8601Schema = z.string().min(1);

export const surveyOptionSchema = z.object({
  optionId: uuidSchema,
  label: z.string(),
});

export const surveyQuestionItemSchema = z.object({
  itemId: uuidSchema,
  itemKey: z.string().min(1),
  itemLabel: z.string(),
});

const questionBaseShape = {
  questionId: uuidSchema,
  questionKey: z.string().min(1),
  title: z.string(),
  prompt: z.string(),
  required: z.boolean(),
};

export const surveyQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    ...questionBaseShape,
    type: z.literal("SINGLE_CHOICE"),
    options: z.array(surveyOptionSchema),
  }),
  z.object({
    ...questionBaseShape,
    type: z.literal("MULTIPLE_CHOICE"),
    minimumSelections: z.number().int().min(0),
    maximumSelections: z.number().int().min(0).nullable(),
    options: z.array(surveyOptionSchema),
  }),
  z.object({
    ...questionBaseShape,
    type: z.enum(["SHORT_TEXT", "LONG_TEXT"]),
    maxLength: z.number().int().positive().nullable(),
  }),
  z.object({
    ...questionBaseShape,
    type: z.literal("NUMBER"),
    minimum: z.number().nullable(),
    maximum: z.number().nullable(),
    decimalScale: z.number().int().min(0),
  }),
  z.object({
    ...questionBaseShape,
    type: z.literal("SCALE"),
    minimum: z.number().int(),
    maximum: z.number().int(),
    minimumLabel: z.string().nullable(),
    maximumLabel: z.string().nullable(),
  }),
  z.object({
    ...questionBaseShape,
    type: z.literal("MATRIX_SINGLE_CHOICE"),
    items: z.array(surveyQuestionItemSchema),
    options: z.array(surveyOptionSchema),
  }),
  z.object({
    ...questionBaseShape,
    type: z.literal("MATRIX_SCALE"),
    items: z.array(surveyQuestionItemSchema),
    minimum: z.number().int(),
    maximum: z.number().int(),
    minimumLabel: z.string().nullable(),
    maximumLabel: z.string().nullable(),
  }),
]);

export const surveySectionSchema = z.object({
  sectionKey: z.string().min(1),
  title: z.string(),
  questions: z.array(surveyQuestionSchema),
});

const pendingSurveyResponseSchema = z.object({
  status: z.literal("PENDING"),
  roundId: uuidSchema,
  contentVersionId: uuidSchema,
  sections: z.array(surveySectionSchema),
});

const submittedSurveyResponseSchema = z.object({
  status: z.literal("SUBMITTED"),
  roundId: uuidSchema,
  contentVersionId: uuidSchema,
  responseId: uuidSchema,
  submittedAt: iso8601Schema,
});

export const currentSurveyResponseSchema = z.discriminatedUnion("status", [
  pendingSurveyResponseSchema,
  submittedSurveyResponseSchema,
]);

const selectionInputSchema = z.object({ optionId: uuidSchema });
const answerBaseShape = { questionId: uuidSchema };

export const surveyAnswerSchema = z.discriminatedUnion("type", [
  z.object({
    ...answerBaseShape,
    type: z.literal("SINGLE_CHOICE"),
    selection: selectionInputSchema,
  }),
  z.object({
    ...answerBaseShape,
    type: z.literal("MULTIPLE_CHOICE"),
    selections: z.array(selectionInputSchema),
  }),
  z.object({ ...answerBaseShape, type: z.enum(["SHORT_TEXT", "LONG_TEXT"]), text: z.string() }),
  z.object({ ...answerBaseShape, type: z.literal("NUMBER"), number: z.number() }),
  z.object({ ...answerBaseShape, type: z.literal("SCALE"), scale: z.number().int() }),
  z.object({
    ...answerBaseShape,
    type: z.literal("MATRIX_SINGLE_CHOICE"),
    itemAnswers: z.array(z.object({ itemId: uuidSchema, selection: selectionInputSchema })),
  }),
  z.object({
    ...answerBaseShape,
    type: z.literal("MATRIX_SCALE"),
    itemAnswers: z.array(z.object({ itemId: uuidSchema, scale: z.number().int() })),
  }),
]);

export const submitSurveyRequestSchema = z.object({
  roundId: uuidSchema,
  answers: z.array(surveyAnswerSchema),
});

export const submissionResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("SUBMITTED"),
    persisted: z.literal(true),
    replayed: z.boolean(),
    responseId: uuidSchema,
    roundId: uuidSchema,
    contentVersionId: uuidSchema,
    submittedAt: iso8601Schema,
  }),
  z.object({
    status: z.literal("PREVIEW_VALIDATED"),
    persisted: z.literal(false),
    roundId: uuidSchema,
    contentVersionId: uuidSchema,
    validatedAt: iso8601Schema,
  }),
]);

export const surveyResponseSummarySchema = z.object({
  responseId: uuidSchema,
  roundId: uuidSchema,
  contentVersionId: uuidSchema,
  submittedAt: iso8601Schema,
});

export const surveyResponseDetailSchema = z.object({
  responseId: uuidSchema,
  roundId: uuidSchema,
  contentVersionId: uuidSchema,
  submittedAt: iso8601Schema,
  sections: z.array(surveySectionSchema),
  answers: z.array(surveyAnswerSchema),
});

export const surveyResponseHistorySchema = z.array(surveyResponseSummarySchema);

export type SurveyOption = z.infer<typeof surveyOptionSchema>;
export type SurveyQuestionItem = z.infer<typeof surveyQuestionItemSchema>;
export type SurveyQuestion = z.infer<typeof surveyQuestionSchema>;
export type SurveySection = z.infer<typeof surveySectionSchema>;
export type CurrentSurveyResponse = z.infer<typeof currentSurveyResponseSchema>;
export type PendingSurveyResponse = z.infer<typeof pendingSurveyResponseSchema>;
export type SubmittedSurveyResponse = z.infer<typeof submittedSurveyResponseSchema>;
export type SelectionInput = z.infer<typeof selectionInputSchema>;
export type SurveyAnswerInput = z.infer<typeof surveyAnswerSchema>;
export type SubmitSurveyRequest = z.infer<typeof submitSurveyRequestSchema>;
export type SubmissionResponse = z.infer<typeof submissionResponseSchema>;
export type SurveyResponseSummary = z.infer<typeof surveyResponseSummarySchema>;
export type SurveyResponseDetail = z.infer<typeof surveyResponseDetailSchema>;
