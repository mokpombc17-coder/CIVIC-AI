export type VoteSurveyQuestionType =
  "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "SHORT_TEXT" | "LONG_TEXT" | "NUMBER" | "SCALE";

export type VoteSurveyOption = Readonly<{
  id: string;
  lineageKey: string;
  kind: "STANDARD" | "OTHER";
  label: string;
  displayOrder: number;
}>;

export type VoteSurveyRule = Readonly<{
  minimumSelections?: number | null;
  maximumSelections?: number | null;
  maxLength?: number | null;
  minimum?: number | null;
  maximum?: number | null;
  decimalAllowed?: boolean | null;
  decimalScale?: number | null;
  minimumLabel?: string | null;
  maximumLabel?: string | null;
}>;

export type VoteSurveyQuestion = Readonly<{
  id: string;
  lineageKey: string;
  type: VoteSurveyQuestionType;
  prompt: string;
  description?: string | null;
  displayOrder: number;
  required: boolean;
  rule: VoteSurveyRule;
  allowOther: boolean;
  options: readonly VoteSurveyOption[];
}>;

export type VoteSurveyContent = Readonly<{
  id: string;
  versionNumber?: number | null;
  name: string;
  description?: string | null;
  questions: readonly VoteSurveyQuestion[];
}>;

export type VoteSurveyEligibility = Readonly<{
  eligible: boolean;
  surveyRequirement: "SATISFIED" | "RECOMMENDED" | "REQUIRED" | "UNAVAILABLE";
  reason?: string | null;
  nextAction?: string | null;
  activeRoundId?: string | null;
  evaluatedAt: string;
  capabilities: readonly string[];
}>;

export type VoteCurrentSurvey = Readonly<{
  round: Readonly<{
    id: string;
    roundNumber: number;
    contentVersionId: string;
    enforcementMode?: string | null;
    activatedAt?: string | null;
  }>;
  content: VoteSurveyContent;
  submitted: boolean;
  eligibility: VoteSurveyEligibility;
}>;

export type VoteSurveySelection = Readonly<{
  optionId: string;
  inputText: string | null;
}>;

export type VoteSurveyAnswer = Readonly<{
  questionId: string;
  type: VoteSurveyQuestionType;
  text?: string;
  number?: number;
  scale?: number;
  selection?: VoteSurveySelection;
  selections?: readonly VoteSurveySelection[];
}>;

export type VoteSurveySubmission = Readonly<{
  roundId: string;
  answers: readonly VoteSurveyAnswer[];
}>;

export type VoteSurveyStoredAnswer = Readonly<{
  questionId: string;
  type: VoteSurveyQuestionType;
  text?: string | null;
  number?: number | null;
  scale?: number | null;
  selections?: readonly VoteSurveySelection[];
}>;

export type VoteSurveyResponseDetail = Readonly<{
  id: string;
  roundId: string;
  roundNumber: number;
  contentVersionId: string;
  submittedAt: string;
  answers: readonly VoteSurveyStoredAnswer[];
  content: VoteSurveyContent;
}>;

export type VoteSurveySubmissionAttempt = Readonly<{
  fingerprint: string;
  key: string;
}>;

export class VoteSurveyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoteSurveyValidationError";
  }
}

export function surveyFieldName(
  questionId: string,
  value: "number" | "scale" | "selection" | "text",
) {
  return `survey:${questionId}:${value}`;
}

export function surveyOtherFieldName(questionId: string, optionId: string): string {
  return `survey:${questionId}:other:${optionId}`;
}

export function orderedSurveyQuestions(
  questions: readonly VoteSurveyQuestion[],
): readonly VoteSurveyQuestion[] {
  return [...questions].sort((left, right) => left.displayOrder - right.displayOrder);
}

export function orderedSurveyOptions(
  options: readonly VoteSurveyOption[],
): readonly VoteSurveyOption[] {
  return [...options].sort((left, right) => left.displayOrder - right.displayOrder);
}

export function buildVoteSurveySubmission(
  survey: VoteCurrentSurvey,
  formData: FormData,
): VoteSurveySubmission {
  return {
    roundId: survey.round.id,
    answers: orderedSurveyQuestions(survey.content.questions).flatMap((question, index) =>
      !question.required && !hasAnswer(question, formData)
        ? []
        : [buildAnswer(question, index + 1, formData)],
    ),
  };
}

export function resolveVoteSurveySubmissionAttempt(
  previous: VoteSurveySubmissionAttempt | null,
  submission: VoteSurveySubmission,
  createUuid: () => string = () => crypto.randomUUID(),
): VoteSurveySubmissionAttempt {
  const fingerprint = JSON.stringify(submission);
  if (previous?.fingerprint === fingerprint) return previous;
  return { fingerprint, key: createUuid() };
}

export function formatStoredSurveyAnswer(
  question: VoteSurveyQuestion,
  answer: VoteSurveyStoredAnswer | undefined,
): string {
  if (!answer || answer.type !== question.type) return "응답 없음";
  if (answer.type === "SHORT_TEXT" || answer.type === "LONG_TEXT") {
    return nonEmpty(answer.text) ?? "응답 없음";
  }
  if (answer.type === "NUMBER") {
    return typeof answer.number === "number" ? String(answer.number) : "응답 없음";
  }
  if (answer.type === "SCALE") {
    return typeof answer.scale === "number" ? String(answer.scale) : "응답 없음";
  }
  const labels = (answer.selections ?? []).map((selection) => selectionLabel(question, selection));
  return labels.length > 0 ? labels.join(", ") : "응답 없음";
}

function buildAnswer(
  question: VoteSurveyQuestion,
  questionNumber: number,
  formData: FormData,
): VoteSurveyAnswer {
  if (question.type === "SINGLE_CHOICE") {
    const optionId = stringValue(formData.get(surveyFieldName(question.id, "selection")));
    if (!optionId) throw missingAnswer(questionNumber);
    return {
      questionId: question.id,
      type: question.type,
      selection: selection(question, optionId, questionNumber, formData),
    };
  }
  if (question.type === "MULTIPLE_CHOICE") {
    const optionIds = formData
      .getAll(surveyFieldName(question.id, "selection"))
      .map(stringValue)
      .filter((value): value is string => value !== null);
    const minimum = question.rule.minimumSelections ?? 1;
    const maximum = question.rule.maximumSelections ?? Number.POSITIVE_INFINITY;
    if (optionIds.length < minimum) {
      throw new VoteSurveyValidationError(
        `${questionNumber}번 질문은 ${minimum}개 이상 선택해 주세요.`,
      );
    }
    if (optionIds.length > maximum) {
      throw new VoteSurveyValidationError(
        `${questionNumber}번 질문은 ${maximum}개 이하로 선택해 주세요.`,
      );
    }
    return {
      questionId: question.id,
      type: question.type,
      selections: optionIds.map((optionId) =>
        selection(question, optionId, questionNumber, formData),
      ),
    };
  }
  if (question.type === "SHORT_TEXT" || question.type === "LONG_TEXT") {
    const text = nonEmpty(formData.get(surveyFieldName(question.id, "text")));
    if (!text) throw missingAnswer(questionNumber);
    const maximum = question.rule.maxLength;
    if (typeof maximum === "number" && text.length > maximum) {
      throw new VoteSurveyValidationError(
        `${questionNumber}번 질문은 ${maximum}자 이하로 입력해 주세요.`,
      );
    }
    return { questionId: question.id, type: question.type, text };
  }
  if (question.type === "NUMBER") {
    const raw = stringValue(formData.get(surveyFieldName(question.id, "number")));
    if (!raw) throw missingAnswer(questionNumber);
    const number = Number(raw);
    if (!Number.isFinite(number)) {
      throw new VoteSurveyValidationError(`${questionNumber}번 질문에 숫자를 입력해 주세요.`);
    }
    const minimum = question.rule.minimum;
    const maximum = question.rule.maximum;
    if (typeof minimum === "number" && number < minimum) {
      throw new VoteSurveyValidationError(
        `${questionNumber}번 질문은 ${minimum} 이상으로 입력해 주세요.`,
      );
    }
    if (typeof maximum === "number" && number > maximum) {
      throw new VoteSurveyValidationError(
        `${questionNumber}번 질문은 ${maximum} 이하로 입력해 주세요.`,
      );
    }
    if (question.rule.decimalAllowed === false && !Number.isInteger(number)) {
      throw new VoteSurveyValidationError(`${questionNumber}번 질문에는 정수를 입력해 주세요.`);
    }
    return { questionId: question.id, type: question.type, number };
  }

  const raw = stringValue(formData.get(surveyFieldName(question.id, "scale")));
  if (!raw) throw missingAnswer(questionNumber);
  const scale = Number(raw);
  const minimum = question.rule.minimum;
  const maximum = question.rule.maximum;
  if (
    !Number.isInteger(scale) ||
    (typeof minimum === "number" && scale < minimum) ||
    (typeof maximum === "number" && scale > maximum)
  ) {
    throw new VoteSurveyValidationError(`${questionNumber}번 질문의 척도 값을 확인해 주세요.`);
  }
  return { questionId: question.id, type: question.type, scale };
}

function hasAnswer(question: VoteSurveyQuestion, formData: FormData): boolean {
  if (question.type === "SINGLE_CHOICE") {
    return stringValue(formData.get(surveyFieldName(question.id, "selection"))) !== null;
  }
  if (question.type === "MULTIPLE_CHOICE") {
    return formData
      .getAll(surveyFieldName(question.id, "selection"))
      .some((value) => stringValue(value) !== null);
  }
  if (question.type === "SHORT_TEXT" || question.type === "LONG_TEXT") {
    return nonEmpty(formData.get(surveyFieldName(question.id, "text"))) !== null;
  }
  const field = question.type === "NUMBER" ? "number" : "scale";
  return stringValue(formData.get(surveyFieldName(question.id, field))) !== null;
}

function selection(
  question: VoteSurveyQuestion,
  optionId: string,
  questionNumber: number,
  formData: FormData,
): VoteSurveySelection {
  const option = question.options.find((candidate) => candidate.id === optionId);
  if (!option) {
    throw new VoteSurveyValidationError(`${questionNumber}번 질문의 선택지를 확인해 주세요.`);
  }
  if (option.kind !== "OTHER") return { optionId, inputText: null };
  const inputText = nonEmpty(formData.get(surveyOtherFieldName(question.id, option.id)));
  if (!inputText) {
    throw new VoteSurveyValidationError(`${questionNumber}번 질문의 기타 내용을 입력해 주세요.`);
  }
  return { optionId, inputText };
}

function selectionLabel(question: VoteSurveyQuestion, selection: VoteSurveySelection): string {
  const option = question.options.find((candidate) => candidate.id === selection.optionId);
  if (!option) return selection.inputText ? `기타: ${selection.inputText}` : "알 수 없는 선택지";
  if (option.kind === "OTHER" && selection.inputText)
    return `${option.label}: ${selection.inputText}`;
  return option.label;
}

function missingAnswer(questionNumber: number): VoteSurveyValidationError {
  return new VoteSurveyValidationError(`${questionNumber}번 질문에 응답해 주세요.`);
}

function stringValue(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nonEmpty(value: FormDataEntryValue | string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
