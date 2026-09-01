export type SurveyQuestionType =
  "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "SHORT_TEXT" | "LONG_TEXT" | "NUMBER" | "SCALE";

export type SurveyRule = Readonly<{
  minimumSelections: number | null;
  maximumSelections: number | null;
  maxLength: number | null;
  minimum: number | null;
  maximum: number | null;
  decimalAllowed: boolean | null;
  decimalScale: number | null;
  minimumLabel: string | null;
  maximumLabel: string | null;
}>;

export type SurveyOption = Readonly<{
  optionId: string;
  optionLocalKey: string;
  kind: "STANDARD" | "OTHER";
  label: string;
  displayOrder: number;
}>;

export type SurveyQuestion = Readonly<{
  questionId: string;
  itemKey: string;
  itemLabel: string | null;
  itemDisplayOrder: number;
  type: SurveyQuestionType;
  prompt: string;
  description: string | null;
  required: boolean;
  rule: SurveyRule;
  options: readonly SurveyOption[];
}>;

export type SurveyQuestionGroup = Readonly<{
  groupKey: string;
  sourceNumber: string;
  displayOrder: number;
  title: string;
  prompt: string;
  description: string | null;
  questions: readonly SurveyQuestion[];
}>;

export type SurveyQuestionSection = Readonly<{
  sectionKey: string;
  title: string;
  description: string | null;
  displayOrder: number;
  groups: readonly SurveyQuestionGroup[];
}>;

export type PublishedSurveyContent = Readonly<{
  name: string;
  description: string | null;
  sections: readonly SurveyQuestionSection[];
}>;

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

export function getSurveyQuestionLabel(
  group: SurveyQuestionGroup,
  question: SurveyQuestion,
): string {
  if (group.questions.length === 1) return group.prompt;
  return question.itemLabel?.trim() || question.prompt;
}

function sortByDisplayOrder<T extends { displayOrder: number }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.displayOrder - right.displayOrder);
}
