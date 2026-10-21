import type {
  SubmitSurveyRequest,
  SurveyAnswerInput,
  SurveyQuestion,
  SurveySection,
} from "./survey-contracts";

export type SurveySelectionDraft = Readonly<{ optionId: string }>;

export type SurveyAnswerDraft =
  | Readonly<{ type: "SINGLE_CHOICE"; selection: SurveySelectionDraft | null }>
  | Readonly<{ type: "MULTIPLE_CHOICE"; selections: readonly SurveySelectionDraft[] }>
  | Readonly<{
      type: "SHORT_TEXT" | "LONG_TEXT";
      text: string;
      inputMethod?: "MANUAL" | "POSTCODE";
      inputSegments?: readonly string[];
    }>
  | Readonly<{ type: "NUMBER"; number: number | null }>
  | Readonly<{ type: "SCALE"; scale: number | null }>
  | Readonly<{
      type: "MATRIX_SINGLE_CHOICE";
      itemAnswers: Readonly<Record<string, SurveySelectionDraft | null | undefined>>;
    }>
  | Readonly<{
      type: "MATRIX_SCALE";
      itemAnswers: Readonly<Record<string, number | null | undefined>>;
    }>;

export type SurveyAnswerState = Readonly<Record<string, SurveyAnswerDraft | undefined>>;
export type SurveyValidationErrors = Readonly<Record<string, string | undefined>>;

export function surveyAnswerErrorKey(questionId: string, itemId?: string): string {
  return itemId ? `${questionId}:${itemId}` : questionId;
}

export function getSurveyQuestions(sections: readonly SurveySection[]): SurveyQuestion[] {
  return sections.flatMap((section) => section.questions);
}

export function createSurveyAnswerState(sections: readonly SurveySection[]): SurveyAnswerState {
  return Object.fromEntries(
    getSurveyQuestions(sections).map((question) => [
      question.questionId,
      createEmptyAnswer(question),
    ]),
  );
}

export function validateSurveySection(
  section: SurveySection,
  answers: SurveyAnswerState,
): SurveyValidationErrors {
  return validateQuestions(section.questions, answers);
}

export function validateSurvey(
  sections: readonly SurveySection[],
  answers: SurveyAnswerState,
): SurveyValidationErrors {
  return validateQuestions(getSurveyQuestions(sections), answers);
}

export function hasAnsweredOptionalQuestion(
  sections: readonly SurveySection[],
  answers: SurveyAnswerState,
): boolean {
  return getSurveyQuestions(sections).some(
    (question) => !question.required && isSurveyAnswerProvided(answers[question.questionId]),
  );
}

export function buildSubmitSurveyRequest(
  roundId: string,
  consentReceiptId: string | null,
  sections: readonly SurveySection[],
  answers: SurveyAnswerState,
): SubmitSurveyRequest {
  if (Object.keys(validateSurvey(sections, answers)).length > 0) {
    throw new Error("유효하지 않은 설문 답변으로 제출 payload를 만들 수 없습니다.");
  }
  if (hasAnsweredOptionalQuestion(sections, answers) !== (consentReceiptId !== null)) {
    throw new Error("선택 문항 응답 여부와 동의 receipt 유무가 일치해야 합니다.");
  }

  return {
    roundId,
    ...(consentReceiptId === null ? {} : { consentReceiptId }),
    answers: getSurveyQuestions(sections)
      .filter(
        (question) => question.required || isSurveyAnswerProvided(answers[question.questionId]),
      )
      .map((question) => toSurveyAnswerInput(question, answers[question.questionId]!)),
  };
}

function isSurveyAnswerProvided(answer: SurveyAnswerDraft | undefined): boolean {
  if (!answer) return false;

  switch (answer.type) {
    case "SINGLE_CHOICE":
      return answer.selection !== null;
    case "MULTIPLE_CHOICE":
      return answer.selections.length > 0;
    case "SHORT_TEXT":
    case "LONG_TEXT":
      return answer.text.trim().length > 0;
    case "NUMBER":
      return answer.number !== null;
    case "SCALE":
      return answer.scale !== null;
    case "MATRIX_SINGLE_CHOICE":
    case "MATRIX_SCALE":
      return Object.values(answer.itemAnswers).some(
        (value) => value !== null && value !== undefined,
      );
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
    case "MATRIX_SINGLE_CHOICE":
    case "MATRIX_SCALE":
      return {
        type: question.type,
        itemAnswers: Object.fromEntries(question.items.map((item) => [item.itemId, null])),
      };
  }
}

function validateQuestions(
  questions: readonly SurveyQuestion[],
  answers: SurveyAnswerState,
): SurveyValidationErrors {
  const entries: [string, string][] = [];
  for (const question of questions) {
    entries.push(...validateSurveyAnswer(question, answers[question.questionId]));
  }
  return Object.fromEntries(entries);
}

function validateSurveyAnswer(
  question: SurveyQuestion,
  answer: SurveyAnswerDraft | undefined,
): [string, string][] {
  const key = surveyAnswerErrorKey(question.questionId);
  if (!answer || answer.type !== question.type) return [[key, "답변을 입력해 주세요."]];

  switch (question.type) {
    case "SINGLE_CHOICE": {
      const selection = answer.type === question.type ? answer.selection : null;
      if (!selection) return question.required ? [[key, "답변을 선택해 주세요."]] : [];
      return question.options.some((option) => option.optionId === selection.optionId)
        ? []
        : [[key, "선택지를 다시 확인해 주세요."]];
    }
    case "MULTIPLE_CHOICE": {
      const selections = answer.type === question.type ? answer.selections : [];
      const count = selections.length;
      if (count < question.minimumSelections) {
        return [[key, `${question.minimumSelections}개 이상 선택해 주세요.`]];
      }
      if (question.maximumSelections !== null && count > question.maximumSelections) {
        return [[key, `${question.maximumSelections}개 이하로 선택해 주세요.`]];
      }
      const validOptionIds = new Set(question.options.map((option) => option.optionId));
      return selections.every((selection) => validOptionIds.has(selection.optionId))
        ? []
        : [[key, "선택지를 다시 확인해 주세요."]];
    }
    case "SHORT_TEXT":
    case "LONG_TEXT": {
      const textAnswer = answer.type === question.type ? answer : null;
      if (!textAnswer) return [[key, "답변을 입력해 주세요."]];
      if (question.required && textAnswer.text.trim().length === 0) {
        return [[key, "답변을 입력해 주세요."]];
      }
      if (
        textAnswer.inputMethod !== "POSTCODE" &&
        textAnswer.inputSegments?.some((segment) => segment.trim().length === 0)
      ) {
        return [[key, "항목을 모두 입력해 주세요."]];
      }
      if (question.maxLength !== null && Array.from(textAnswer.text).length > question.maxLength) {
        return [[key, `${question.maxLength}자 이하로 입력해 주세요.`]];
      }
      return [];
    }
    case "NUMBER": {
      const value = answer.type === question.type ? answer.number : null;
      if (value === null) return question.required ? [[key, "숫자를 입력해 주세요."]] : [];
      if (!Number.isFinite(value)) return [[key, "올바른 숫자를 입력해 주세요."]];
      if (getDecimalPlaces(value) > question.decimalScale) {
        return [
          [
            key,
            question.decimalScale === 0
              ? "정수로 입력해 주세요."
              : `소수점 ${question.decimalScale}자리 이하로 입력해 주세요.`,
          ],
        ];
      }
      if (question.minimum !== null && value < question.minimum) {
        return [[key, `${question.minimum} 이상으로 입력해 주세요.`]];
      }
      if (question.maximum !== null && value > question.maximum) {
        return [[key, `${question.maximum} 이하로 입력해 주세요.`]];
      }
      return [];
    }
    case "SCALE": {
      const value = answer.type === question.type ? answer.scale : null;
      return validateScale(key, value, question.minimum, question.maximum, question.required);
    }
    case "MATRIX_SINGLE_CHOICE": {
      const itemAnswers = answer.type === question.type ? answer.itemAnswers : {};
      const validOptionIds = new Set(question.options.map((option) => option.optionId));
      return question.items.flatMap((item): [string, string][] => {
        const itemKey = surveyAnswerErrorKey(question.questionId, item.itemId);
        const selection = itemAnswers[item.itemId];
        if (!selection) return question.required ? [[itemKey, "답변을 선택해 주세요."]] : [];
        return validOptionIds.has(selection.optionId)
          ? []
          : [[itemKey, "선택지를 다시 확인해 주세요."]];
      });
    }
    case "MATRIX_SCALE": {
      const itemAnswers = answer.type === question.type ? answer.itemAnswers : {};
      return question.items.flatMap((item) =>
        validateScale(
          surveyAnswerErrorKey(question.questionId, item.itemId),
          itemAnswers[item.itemId] ?? null,
          question.minimum,
          question.maximum,
          question.required,
        ),
      );
    }
  }
}

function validateScale(
  key: string,
  value: number | null,
  minimum: number,
  maximum: number,
  required: boolean,
): [string, string][] {
  if (value === null) return required ? [[key, "답변을 선택해 주세요."]] : [];
  return Number.isInteger(value) && value >= minimum && value <= maximum
    ? []
    : [[key, "척도 값을 다시 선택해 주세요."]];
}

function toSurveyAnswerInput(
  question: SurveyQuestion,
  answer: SurveyAnswerDraft,
): SurveyAnswerInput {
  switch (answer.type) {
    case "SINGLE_CHOICE":
      return { questionId: question.questionId, type: answer.type, selection: answer.selection! };
    case "MULTIPLE_CHOICE":
      return {
        questionId: question.questionId,
        type: answer.type,
        selections: [...answer.selections],
      };
    case "SHORT_TEXT":
    case "LONG_TEXT":
      return { questionId: question.questionId, type: answer.type, text: answer.text.trim() };
    case "NUMBER":
      return { questionId: question.questionId, type: answer.type, number: answer.number! };
    case "SCALE":
      return { questionId: question.questionId, type: answer.type, scale: answer.scale! };
    case "MATRIX_SINGLE_CHOICE":
      if (question.type !== answer.type) throw new Error("설문 답변 타입이 일치하지 않습니다.");
      return {
        questionId: question.questionId,
        type: answer.type,
        itemAnswers: question.items.map((item) => ({
          itemId: item.itemId,
          selection: answer.itemAnswers[item.itemId]!,
        })),
      };
    case "MATRIX_SCALE":
      if (question.type !== answer.type) throw new Error("설문 답변 타입이 일치하지 않습니다.");
      return {
        questionId: question.questionId,
        type: answer.type,
        itemAnswers: question.items.map((item) => ({
          itemId: item.itemId,
          scale: answer.itemAnswers[item.itemId]!,
        })),
      };
  }
}

function getDecimalPlaces(value: number): number {
  const text = String(value);
  const exponentIndex = text.toLowerCase().indexOf("e-");
  if (exponentIndex >= 0) return Number.parseInt(text.slice(exponentIndex + 2), 10);
  return text.includes(".") ? text.length - text.indexOf(".") - 1 : 0;
}
