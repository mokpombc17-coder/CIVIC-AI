import {
  getSurveyQuestions,
  sortSurveyGroups,
  sortSurveyQuestions,
  type PublishedSurveyContent,
  type SubmitSurveyAnswer,
  type SubmitSurveyRequest,
  type SurveyOption,
  type SurveyQuestion,
  type SurveyQuestionSection,
} from "./survey-contracts";

export type SurveySelectionDraft = Readonly<{
  optionId: string;
  inputText: string;
}>;

export type SurveyAnswerDraft =
  | Readonly<{ type: "SINGLE_CHOICE"; selection: SurveySelectionDraft | null }>
  | Readonly<{ type: "MULTIPLE_CHOICE"; selections: readonly SurveySelectionDraft[] }>
  | Readonly<{
      type: "SHORT_TEXT" | "LONG_TEXT";
      text: string;
      inputSegments?: readonly string[];
    }>
  | Readonly<{ type: "NUMBER"; number: number | null }>
  | Readonly<{ type: "SCALE"; scale: number | null }>;

export type SurveyAnswerState = Readonly<Record<string, SurveyAnswerDraft | undefined>>;
export type SurveyValidationErrors = Readonly<Record<string, string | undefined>>;

export function createSurveyAnswerState(content: PublishedSurveyContent): SurveyAnswerState {
  return Object.fromEntries(
    getSurveyQuestions(content).map((question) => [
      question.questionId,
      createEmptyAnswer(question),
    ]),
  );
}

export function validateSurveySection(
  section: SurveyQuestionSection,
  answers: SurveyAnswerState,
): SurveyValidationErrors {
  return Object.fromEntries(
    sortSurveyGroups(section.groups)
      .flatMap((group) => sortSurveyQuestions(group.questions))
      .map((question) => [
        question.questionId,
        validateSurveyAnswer(question, answers[question.questionId]),
      ])
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

export function validateSurvey(
  content: PublishedSurveyContent,
  answers: SurveyAnswerState,
): SurveyValidationErrors {
  return Object.fromEntries(
    getSurveyQuestions(content)
      .map((question) => [
        question.questionId,
        validateSurveyAnswer(question, answers[question.questionId]),
      ])
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

export function createSubmitSurveyRequest(
  roundId: string,
  content: PublishedSurveyContent,
  answers: SurveyAnswerState,
): SubmitSurveyRequest {
  const errors = validateSurvey(content, answers);
  if (Object.keys(errors).length > 0) {
    throw new SurveyAnswerValidationError(errors);
  }

  return {
    roundId,
    answers: getSurveyQuestions(content).map((question) =>
      serializeAnswer(question, requireAnswer(question, answers[question.questionId])),
    ),
  };
}

export class SurveyAnswerValidationError extends Error {
  override readonly name = "SurveyAnswerValidationError";

  constructor(readonly errors: SurveyValidationErrors) {
    super("필수 설문 응답을 모두 확인해 주세요.");
  }
}

function createEmptyAnswer(question: SurveyQuestion): SurveyAnswerDraft {
  switch (question.type) {
    case "SINGLE_CHOICE":
      return { type: question.type, selection: null };
    case "MULTIPLE_CHOICE":
      return { type: question.type, selections: [] };
    case "SHORT_TEXT":
    case "LONG_TEXT":
      return { type: question.type, text: "" };
    case "NUMBER":
      return { type: question.type, number: null };
    case "SCALE":
      return { type: question.type, scale: null };
  }
}

function validateSurveyAnswer(
  question: SurveyQuestion,
  answer: SurveyAnswerDraft | undefined,
): string | undefined {
  if (!answer || answer.type !== question.type) return "답변을 입력해 주세요.";

  switch (answer.type) {
    case "SINGLE_CHOICE": {
      if (!answer.selection) return question.required ? "답변을 선택해 주세요." : undefined;
      const option = findOption(question, answer.selection.optionId);
      if (!option) return "선택지를 다시 확인해 주세요.";
      return validateOtherInput(option, answer.selection.inputText);
    }
    case "MULTIPLE_CHOICE": {
      const count = answer.selections.length;
      const minimum = question.rule.minimumSelections ?? (question.required ? 1 : 0);
      const maximum = question.rule.maximumSelections;
      if (count < minimum) return `${minimum}개 이상 선택해 주세요.`;
      if (maximum !== null && count > maximum) return `${maximum}개 이하로 선택해 주세요.`;
      for (const selection of answer.selections) {
        const option = findOption(question, selection.optionId);
        if (!option) return "선택지를 다시 확인해 주세요.";
        const otherError = validateOtherInput(option, selection.inputText);
        if (otherError) return otherError;
      }
      return undefined;
    }
    case "SHORT_TEXT":
    case "LONG_TEXT": {
      const value = answer.text.trim();
      if (question.required && value.length === 0) return "답변을 입력해 주세요.";
      if (answer.inputSegments?.some((segment) => segment.trim().length === 0)) {
        return "항목을 모두 입력해 주세요.";
      }
      if (
        question.rule.maxLength !== null &&
        Array.from(answer.text).length > question.rule.maxLength
      ) {
        return `${question.rule.maxLength}자 이하로 입력해 주세요.`;
      }
      return undefined;
    }
    case "NUMBER": {
      const value = answer.number;
      if (value === null) return question.required ? "숫자를 입력해 주세요." : undefined;
      if (!Number.isFinite(value)) return "올바른 숫자를 입력해 주세요.";
      if (question.rule.decimalAllowed === false && !Number.isInteger(value)) {
        return "정수로 입력해 주세요.";
      }
      if (
        question.rule.decimalAllowed === true &&
        question.rule.decimalScale !== null &&
        getDecimalPlaces(value) > question.rule.decimalScale
      ) {
        return `소수점 ${question.rule.decimalScale}자리 이하로 입력해 주세요.`;
      }
      if (question.rule.minimum !== null && value < question.rule.minimum) {
        return `${question.rule.minimum} 이상으로 입력해 주세요.`;
      }
      if (question.rule.maximum !== null && value > question.rule.maximum) {
        return `${question.rule.maximum} 이하로 입력해 주세요.`;
      }
      return undefined;
    }
    case "SCALE": {
      const value = answer.scale;
      if (value === null) return question.required ? "답변을 선택해 주세요." : undefined;
      if (!Number.isInteger(value)) return "척도 값을 다시 선택해 주세요.";
      if (question.rule.minimum !== null && value < question.rule.minimum) {
        return "척도 값을 다시 선택해 주세요.";
      }
      if (question.rule.maximum !== null && value > question.rule.maximum) {
        return "척도 값을 다시 선택해 주세요.";
      }
      return undefined;
    }
  }
}

function serializeAnswer(question: SurveyQuestion, answer: SurveyAnswerDraft): SubmitSurveyAnswer {
  switch (answer.type) {
    case "SINGLE_CHOICE": {
      const selection = answer.selection!;
      return {
        questionId: question.questionId,
        type: answer.type,
        selection: serializeSelection(question, selection),
      };
    }
    case "MULTIPLE_CHOICE":
      return {
        questionId: question.questionId,
        type: answer.type,
        selections: answer.selections.map((selection) => serializeSelection(question, selection)),
      };
    case "SHORT_TEXT":
    case "LONG_TEXT":
      return { questionId: question.questionId, type: answer.type, text: answer.text.trim() };
    case "NUMBER":
      return { questionId: question.questionId, type: answer.type, number: answer.number! };
    case "SCALE":
      return { questionId: question.questionId, type: answer.type, scale: answer.scale! };
  }
}

function serializeSelection(
  question: SurveyQuestion,
  selection: SurveySelectionDraft,
): { optionId: string; inputText: string | null } {
  const option = findOption(question, selection.optionId)!;
  return {
    optionId: selection.optionId,
    inputText: option.kind === "OTHER" ? selection.inputText.trim() : null,
  };
}

function requireAnswer(
  question: SurveyQuestion,
  answer: SurveyAnswerDraft | undefined,
): SurveyAnswerDraft {
  if (!answer || answer.type !== question.type) throw new SurveyAnswerValidationError({});
  return answer;
}

function findOption(question: SurveyQuestion, optionId: string): SurveyOption | undefined {
  return question.options.find((option) => option.optionId === optionId);
}

function validateOtherInput(option: SurveyOption, inputText: string): string | undefined {
  return option.kind === "OTHER" && inputText.trim().length === 0
    ? "기타 내용을 입력해 주세요."
    : undefined;
}

function getDecimalPlaces(value: number): number {
  const text = String(value);
  const exponentIndex = text.toLowerCase().indexOf("e-");
  if (exponentIndex >= 0) return Number.parseInt(text.slice(exponentIndex + 2), 10);
  return text.includes(".") ? text.length - text.indexOf(".") - 1 : 0;
}
