import {
  currentSurveyResponseSchema,
  type CurrentSurveyResponse,
  type SurveyQuestion,
} from "./survey-contracts";

export const SURVEY_ROUND_ID = testUuid(1);
export const SURVEY_CONTENT_ID = testUuid(2);
export const SURVEY_SECTION_ID = testUuid(3);

export const surveyQuestionFixtures = {
  single: createQuestion(10, "SINGLE_CHOICE", {
    options: [createOption(101, "선택 A"), createOption(102, "기타", "OTHER")],
  }),
  multiple: createQuestion(20, "MULTIPLE_CHOICE", {
    rule: { minimumSelections: 1, maximumSelections: 2 },
    options: [createOption(201, "복수 A"), createOption(202, "복수 B")],
  }),
  shortText: createQuestion(30, "SHORT_TEXT", { rule: { maxLength: 20 } }),
  longText: createQuestion(40, "LONG_TEXT", { rule: { maxLength: 100 } }),
  number: createQuestion(50, "NUMBER", {
    rule: { minimum: 1900, maximum: 2026, decimalAllowed: false, decimalScale: 0 },
  }),
  scale: createQuestion(60, "SCALE", {
    rule: { minimum: 0, maximum: 10, minimumLabel: "낮음", maximumLabel: "높음" },
  }),
} satisfies Record<string, SurveyQuestion>;

export const currentSurveyFixture: CurrentSurveyResponse = currentSurveyResponseSchema.parse({
  round: {
    id: SURVEY_ROUND_ID,
    roundNumber: 1,
    contentVersionId: SURVEY_CONTENT_ID,
    enforcementMode: "REQUIRED",
    activatedAt: "2026-09-01T00:00:00Z",
  },
  content: {
    id: SURVEY_CONTENT_ID,
    versionNumber: 1,
    name: "사용자 특성 기초설문",
    description: null,
    sections: [
      {
        sectionId: SURVEY_SECTION_ID,
        sectionLineageId: testUuid(4),
        sectionKey: "test-section",
        title: "테스트 Section",
        description: null,
        displayOrder: 1,
        groups: Object.values(surveyQuestionFixtures).map((question, index) => ({
          groupId: testUuid(300 + index),
          groupLineageId: testUuid(400 + index),
          groupKey: `group-${index + 1}`,
          sourceNumber: String(index + 1),
          displayOrder: index + 1,
          title: question.itemLabel,
          prompt: question.prompt,
          description: null,
          questions: [question],
        })),
      },
    ],
  },
  submitted: false,
  eligibility: {
    eligible: false,
    surveyRequirement: "REQUIRED",
    reason: "CURRENT_SURVEY_RESPONSE_REQUIRED",
    nextAction: "COMPLETE_CURRENT_SURVEY",
    activeRoundId: SURVEY_ROUND_ID,
    evaluatedAt: "2026-09-01T00:00:00Z",
    capabilities: ["VIEW_CURRENT_SURVEY", "SUBMIT_CURRENT_SURVEY"],
  },
});

function createQuestion(
  seed: number,
  type: SurveyQuestion["type"],
  overrides: Readonly<{
    options?: SurveyQuestion["options"];
    rule?: Partial<SurveyQuestion["rule"]>;
  }> = {},
): SurveyQuestion {
  return {
    questionId: testUuid(seed),
    questionLineageId: testUuid(seed + 1),
    itemKey: `item-${seed}`,
    itemLabel: `문항 ${seed}`,
    itemDisplayOrder: 1,
    type,
    prompt: `문항 ${seed}에 답해 주세요.`,
    description: null,
    required: true,
    rule: {
      minimumSelections: null,
      maximumSelections: null,
      maxLength: null,
      minimum: null,
      maximum: null,
      decimalAllowed: null,
      decimalScale: null,
      minimumLabel: null,
      maximumLabel: null,
      ...overrides.rule,
    },
    options: overrides.options ?? [],
  };
}

function createOption(seed: number, label: string, kind: "STANDARD" | "OTHER" = "STANDARD") {
  return {
    optionId: testUuid(seed),
    optionLineageId: testUuid(seed + 1_000),
    optionLocalKey: `option-${seed}`,
    kind,
    label,
    displayOrder: seed,
  } as const;
}

export function testUuid(seed: number): string {
  return `00000000-0000-4000-8000-${seed.toString(16).padStart(12, "0")}`;
}
