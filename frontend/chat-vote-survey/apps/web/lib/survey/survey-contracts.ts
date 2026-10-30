import { z } from "zod";

const uuidSchema = z.string().uuid();
const iso8601Schema = z.string().min(1);
const MAX_SCALE_OPTION_COUNT = 101;

export const surveyOptionSchema = z.object({
  optionId: uuidSchema,
  label: z.string().min(1),
});

export const surveyQuestionItemSchema = z.object({
  itemId: uuidSchema,
  itemKey: z.string().min(1),
  itemLabel: z.string().min(1),
});

const questionBaseShape = {
  questionId: uuidSchema,
  questionKey: z.string().min(1),
  title: z.string().min(1),
  prompt: z.string().min(1),
  required: z.boolean(),
};

const surveyQuestionVariantSchema = z.discriminatedUnion("type", [
  z.object({
    ...questionBaseShape,
    type: z.literal("SINGLE_CHOICE"),
    options: z.array(surveyOptionSchema).min(1),
  }),
  z.object({
    ...questionBaseShape,
    type: z.literal("MULTIPLE_CHOICE"),
    minimumSelections: z.number().int().min(1),
    maximumSelections: z.number().int().min(0).nullable(),
    options: z.array(surveyOptionSchema).min(1),
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
    items: z.array(surveyQuestionItemSchema).min(1),
    options: z.array(surveyOptionSchema).min(1),
  }),
  z.object({
    ...questionBaseShape,
    type: z.literal("MATRIX_SCALE"),
    items: z.array(surveyQuestionItemSchema).min(1),
    minimum: z.number().int(),
    maximum: z.number().int(),
    minimumLabel: z.string().nullable(),
    maximumLabel: z.string().nullable(),
  }),
]);

export const surveyQuestionSchema = surveyQuestionVariantSchema.superRefine((question, context) => {
  if ("options" in question) {
    addDuplicateIssues(
      question.options.map((option) => option.optionId),
      "optionId",
      "선택지 ID",
      context,
      ["options"],
    );
  }
  if ("items" in question) {
    addDuplicateIssues(
      question.items.map((item) => item.itemId),
      "itemId",
      "행렬 Item ID",
      context,
      ["items"],
    );
    addDuplicateIssues(
      question.items.map((item) => item.itemKey),
      "itemKey",
      "행렬 Item key",
      context,
      ["items"],
    );
  }

  switch (question.type) {
    case "MULTIPLE_CHOICE": {
      if (question.minimumSelections > question.options.length) {
        addCustomIssue(context, ["minimumSelections"], "최소 선택 개수가 선택지 수보다 큽니다.");
      }
      if (
        question.maximumSelections !== null &&
        question.maximumSelections < question.minimumSelections
      ) {
        addCustomIssue(
          context,
          ["maximumSelections"],
          "최대 선택 개수가 최소 선택 개수보다 작습니다.",
        );
      }
      if (
        question.maximumSelections !== null &&
        question.maximumSelections > question.options.length
      ) {
        addCustomIssue(context, ["maximumSelections"], "최대 선택 개수가 선택지 수보다 큽니다.");
      }
      break;
    }
    case "NUMBER":
      if (
        question.minimum !== null &&
        question.maximum !== null &&
        question.minimum > question.maximum
      ) {
        addCustomIssue(context, ["maximum"], "최댓값이 최솟값보다 작습니다.");
      }
      break;
    case "SCALE":
    case "MATRIX_SCALE":
      if (question.minimum > question.maximum) {
        addCustomIssue(context, ["maximum"], "척도 최댓값이 최솟값보다 작습니다.");
      } else if (question.maximum - question.minimum + 1 > MAX_SCALE_OPTION_COUNT) {
        addCustomIssue(context, ["maximum"], "척도 선택지 범위가 너무 큽니다.");
      }
      break;
  }
});

export const surveySectionSchema = z.object({
  sectionKey: z.string().min(1),
  title: z.string().min(1),
  questions: z.array(surveyQuestionSchema).min(1),
});

const surveySectionsSchema = z
  .array(surveySectionSchema)
  .min(1)
  .superRefine((sections, context) => {
    addDuplicateIssues(
      sections.map((section) => section.sectionKey),
      "sectionKey",
      "Section key",
      context,
    );

    const questionIds: string[] = [];
    const questionKeys: string[] = [];
    const questionPaths: Array<readonly (string | number)[]> = [];
    sections.forEach((section, sectionIndex) => {
      section.questions.forEach((question, questionIndex) => {
        questionIds.push(question.questionId);
        questionKeys.push(question.questionKey);
        questionPaths.push([sectionIndex, "questions", questionIndex]);
      });
    });
    addDuplicateIssues(questionIds, "questionId", "Question ID", context, [], questionPaths);
    addDuplicateIssues(questionKeys, "questionKey", "Question key", context, [], questionPaths);
  });

const pendingSurveyResponseSchema = z.object({
  status: z.literal("PENDING"),
  roundId: uuidSchema,
  contentVersionId: uuidSchema,
  sections: surveySectionsSchema,
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
  consentReceiptId: uuidSchema.optional(),
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
  sections: surveySectionsSchema,
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

function addDuplicateIssues(
  values: readonly string[],
  field: string,
  label: string,
  context: z.RefinementCtx,
  prefix: readonly (string | number)[] = [],
  itemPaths?: readonly (readonly (string | number)[])[],
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (!seen.has(value)) {
      seen.add(value);
      return;
    }
    addCustomIssue(
      context,
      [...(itemPaths?.[index] ?? [...prefix, index]), field],
      `${label}가 중복되었습니다.`,
    );
  });
}

function addCustomIssue(
  context: z.RefinementCtx,
  path: readonly (string | number)[],
  message: string,
): void {
  context.addIssue({ code: "custom", path: [...path], message });
}
