import { z } from "zod";

const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const surveyUuidSchema = z.string().regex(canonicalUuidPattern, "UUID 형식이어야 합니다.");
const timestampSchema = z.string().min(1);

export const surveyQuestionTypeSchema = z.enum([
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "SHORT_TEXT",
  "LONG_TEXT",
  "NUMBER",
  "SCALE",
]);
export const surveyOptionKindSchema = z.enum(["STANDARD", "OTHER"]);
export const surveyEnforcementModeSchema = z.enum(["ADVISORY", "REQUIRED"]);

export const surveyRuleSchema = z.object({
  minimumSelections: z.number().int().nullable(),
  maximumSelections: z.number().int().nullable(),
  maxLength: z.number().int().nullable(),
  minimum: z.number().nullable(),
  maximum: z.number().nullable(),
  decimalAllowed: z.boolean().nullable(),
  decimalScale: z.number().int().nullable(),
  minimumLabel: z.string().nullable(),
  maximumLabel: z.string().nullable(),
});

export const surveyOptionSchema = z.object({
  optionId: surveyUuidSchema,
  optionLineageId: surveyUuidSchema,
  optionLocalKey: z.string().min(1),
  kind: surveyOptionKindSchema,
  label: z.string(),
  displayOrder: z.number().int(),
});

export const surveyQuestionSchema = z.object({
  questionId: surveyUuidSchema,
  questionLineageId: surveyUuidSchema,
  itemKey: z.string().min(1),
  itemLabel: z.string(),
  itemDisplayOrder: z.number().int(),
  type: surveyQuestionTypeSchema,
  prompt: z.string(),
  description: z.string().nullable(),
  required: z.boolean(),
  rule: surveyRuleSchema,
  options: z.array(surveyOptionSchema),
});

export const surveyQuestionGroupSchema = z.object({
  groupId: surveyUuidSchema,
  groupLineageId: surveyUuidSchema,
  groupKey: z.string().min(1),
  sourceNumber: z.string(),
  displayOrder: z.number().int(),
  title: z.string(),
  prompt: z.string(),
  description: z.string().nullable(),
  questions: z.array(surveyQuestionSchema),
});

export const surveyQuestionSectionSchema = z.object({
  sectionId: surveyUuidSchema,
  sectionLineageId: surveyUuidSchema,
  sectionKey: z.string().min(1),
  title: z.string(),
  description: z.string().nullable(),
  displayOrder: z.number().int(),
  groups: z.array(surveyQuestionGroupSchema),
});

export const publishedSurveyContentSchema = z.object({
  id: surveyUuidSchema,
  versionNumber: z.number().int().positive(),
  name: z.string(),
  description: z.string().nullable(),
  sections: z.array(surveyQuestionSectionSchema),
});

export const surveyEligibilitySchema = z.object({
  eligible: z.boolean(),
  surveyRequirement: z.enum(["SATISFIED", "RECOMMENDED", "REQUIRED", "UNAVAILABLE"]),
  reason: z
    .enum([
      "CURRENT_SURVEY_RESPONSE_RECOMMENDED",
      "CURRENT_SURVEY_RESPONSE_REQUIRED",
      "ACTIVE_SURVEY_ROUND_UNAVAILABLE",
    ])
    .nullable(),
  nextAction: z.literal("COMPLETE_CURRENT_SURVEY").nullable(),
  activeRoundId: surveyUuidSchema.nullable(),
  evaluatedAt: timestampSchema,
  capabilities: z.array(
    z.enum([
      "USE_GENERAL_SERVICE",
      "USE_PERSONALIZED_SERVICE",
      "VIEW_CURRENT_SURVEY",
      "SUBMIT_CURRENT_SURVEY",
      "VIEW_OWN_SURVEY_RESPONSES",
    ]),
  ),
});

export const currentSurveyResponseSchema = z.object({
  round: z.object({
    id: surveyUuidSchema,
    roundNumber: z.number().int().positive(),
    contentVersionId: surveyUuidSchema,
    enforcementMode: surveyEnforcementModeSchema,
    activatedAt: timestampSchema,
  }),
  content: publishedSurveyContentSchema,
  submitted: z.boolean(),
  eligibility: surveyEligibilitySchema,
});

export const surveySelectionInputSchema = z.object({
  optionId: surveyUuidSchema,
  inputText: z.string().nullable().optional(),
});

export const submitSurveyAnswerSchema = z.discriminatedUnion("type", [
  z.object({
    questionId: surveyUuidSchema,
    type: z.literal("SINGLE_CHOICE"),
    selection: surveySelectionInputSchema,
  }),
  z.object({
    questionId: surveyUuidSchema,
    type: z.literal("MULTIPLE_CHOICE"),
    selections: z.array(surveySelectionInputSchema),
  }),
  z.object({
    questionId: surveyUuidSchema,
    type: z.enum(["SHORT_TEXT", "LONG_TEXT"]),
    text: z.string(),
  }),
  z.object({
    questionId: surveyUuidSchema,
    type: z.literal("NUMBER"),
    number: z.number().finite(),
  }),
  z.object({
    questionId: surveyUuidSchema,
    type: z.literal("SCALE"),
    scale: z.number().finite(),
  }),
]);

export const submitSurveyRequestSchema = z.object({
  roundId: surveyUuidSchema,
  answers: z.array(submitSurveyAnswerSchema),
});

export const surveySubmissionResponseSchema = z.object({
  code: z.literal("SURVEY_RESPONSE_SUBMITTED"),
  replayed: z.boolean(),
  responseId: surveyUuidSchema,
  roundId: surveyUuidSchema,
  contentVersionId: surveyUuidSchema,
  submittedAt: timestampSchema,
});

export const surveyResponseSummarySchema = z.object({
  id: surveyUuidSchema,
  roundId: surveyUuidSchema,
  roundNumber: z.number().int().positive(),
  contentVersionId: surveyUuidSchema,
  submittedAt: timestampSchema,
});

export const surveyResponseListSchema = z.array(surveyResponseSummarySchema);

export const storedSurveyAnswerSchema = z.object({
  questionId: surveyUuidSchema,
  type: surveyQuestionTypeSchema,
  text: z.string().nullable(),
  number: z.number().nullable(),
  scale: z.number().nullable(),
  selections: z.array(
    z.object({
      optionId: surveyUuidSchema,
      inputText: z.string().nullable(),
    }),
  ),
});

export const surveyResponseDetailSchema = z.object({
  id: surveyUuidSchema,
  roundId: surveyUuidSchema,
  roundNumber: z.number().int().positive(),
  contentVersionId: surveyUuidSchema,
  submittedAt: timestampSchema,
  answers: z.array(storedSurveyAnswerSchema),
  content: publishedSurveyContentSchema,
});

export type SurveyQuestionType = z.infer<typeof surveyQuestionTypeSchema>;
export type SurveyOption = z.infer<typeof surveyOptionSchema>;
export type SurveyQuestion = z.infer<typeof surveyQuestionSchema>;
export type SurveyQuestionGroup = z.infer<typeof surveyQuestionGroupSchema>;
export type SurveyQuestionSection = z.infer<typeof surveyQuestionSectionSchema>;
export type PublishedSurveyContent = z.infer<typeof publishedSurveyContentSchema>;
export type SurveyEligibility = z.infer<typeof surveyEligibilitySchema>;
export type CurrentSurveyResponse = z.infer<typeof currentSurveyResponseSchema>;
export type SubmitSurveyAnswer = z.infer<typeof submitSurveyAnswerSchema>;
export type SubmitSurveyRequest = z.infer<typeof submitSurveyRequestSchema>;
export type SurveySubmissionResponse = z.infer<typeof surveySubmissionResponseSchema>;
export type SurveyResponseSummary = z.infer<typeof surveyResponseSummarySchema>;
export type SurveyResponseDetail = z.infer<typeof surveyResponseDetailSchema>;

export function sortSurveySections(
  sections: readonly SurveyQuestionSection[],
): SurveyQuestionSection[] {
  return sortByDisplayOrder(sections);
}

export function sortSurveyGroups(groups: readonly SurveyQuestionGroup[]): SurveyQuestionGroup[] {
  return sortByDisplayOrder(groups);
}

export function sortSurveyQuestions(questions: readonly SurveyQuestion[]): SurveyQuestion[] {
  return [...questions].sort((left, right) => left.itemDisplayOrder - right.itemDisplayOrder);
}

export function sortSurveyOptions(options: readonly SurveyOption[]): SurveyOption[] {
  return sortByDisplayOrder(options);
}

export function getSurveyQuestions(content: PublishedSurveyContent): SurveyQuestion[] {
  return sortSurveySections(content.sections).flatMap((section) =>
    sortSurveyGroups(section.groups).flatMap((group) => sortSurveyQuestions(group.questions)),
  );
}

function sortByDisplayOrder<T extends { displayOrder: number }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.displayOrder - right.displayOrder);
}
