import type { SurveyQuestion, SurveySection } from "./survey-contracts";
import {
  createSurveyAnswerState,
  getSurveyQuestions,
  type SurveyAnswerDraft,
  type SurveyAnswerState,
} from "./survey-answer-state";

const SURVEY_DRAFT_SCHEMA_VERSION = 1;
export const SURVEY_DRAFT_TTL_MS = 24 * 60 * 60 * 1_000;
const SURVEY_DRAFT_STORAGE_PREFIX = "civic-ai:survey-draft:v1";

type SurveyDraftStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export type SurveyDraftScope = Readonly<{
  contentVersionId: string;
  ownerKey: string;
  roundId: string;
}>;

export type SurveyDraftSnapshot = Readonly<{
  answers: SurveyAnswerState;
  currentStep: number;
}>;

type StoredSurveyDraft = Readonly<{
  answers: unknown;
  contentVersionId: string;
  currentStep: number;
  roundId: string;
  schemaVersion: number;
  updatedAt: number;
}>;

type AuthMeRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

// 사용자 확인이 응답 없이 걸리면 설문 화면이 임시 저장 확인에서 멈추므로 시간을 넘기면 임시 저장 없이 시작함
const SURVEY_DRAFT_OWNER_TIMEOUT_MS = 5_000;

// 쿠키·저장소가 차단된 환경에서는 sessionStorage를 읽는 순간 예외가 나므로 저장소 없이 진행하도록 감쌈
export function getSurveyDraftStorage(): SurveyDraftStorage | null {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}

export async function resolveSurveyDraftOwnerKey(
  request: AuthMeRequest = fetch,
  timeoutMs = SURVEY_DRAFT_OWNER_TIMEOUT_MS,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await request("/api/v1/auth/me", {
      cache: "no-store",
      credentials: "same-origin",
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const body: unknown = await response.json();
    if (!isRecord(body)) return null;
    const subject = readNonEmptyString(body.subject) ?? readNonEmptyString(body.sub);
    if (!subject) return null;

    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(subject));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function loadSurveyDraft(
  storage: SurveyDraftStorage,
  scope: SurveyDraftScope,
  sections: readonly SurveySection[],
  now = Date.now(),
): SurveyDraftSnapshot | null {
  const key = createSurveyDraftStorageKey(scope);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;

    const stored: unknown = JSON.parse(raw);
    if (!isStoredSurveyDraft(stored, scope, now)) {
      storage.removeItem(key);
      return null;
    }

    return {
      answers: restoreSurveyAnswers(stored.answers, sections),
      currentStep: clampStep(stored.currentStep, sections.length + 1),
    };
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Storage can be unavailable in privacy mode. Survey entry must remain usable.
    }
    return null;
  }
}

export function saveSurveyDraft(
  storage: SurveyDraftStorage,
  scope: SurveyDraftScope,
  snapshot: SurveyDraftSnapshot,
  now = Date.now(),
): void {
  const stored: StoredSurveyDraft = {
    answers: snapshot.answers,
    contentVersionId: scope.contentVersionId,
    currentStep: snapshot.currentStep,
    roundId: scope.roundId,
    schemaVersion: SURVEY_DRAFT_SCHEMA_VERSION,
    updatedAt: now,
  };

  try {
    storage.setItem(createSurveyDraftStorageKey(scope), JSON.stringify(stored));
  } catch {
    // Quota and privacy-mode failures must not block survey entry.
  }
}

export function removeSurveyDraft(storage: SurveyDraftStorage, scope: SurveyDraftScope): void {
  try {
    storage.removeItem(createSurveyDraftStorageKey(scope));
  } catch {
    // Storage cleanup is best-effort and must not block successful navigation.
  }
}

export function createSurveyDraftStorageKey(scope: SurveyDraftScope): string {
  return [
    SURVEY_DRAFT_STORAGE_PREFIX,
    encodeURIComponent(scope.ownerKey),
    encodeURIComponent(scope.roundId),
    encodeURIComponent(scope.contentVersionId),
  ].join(":");
}

function isStoredSurveyDraft(
  value: unknown,
  scope: SurveyDraftScope,
  now: number,
): value is StoredSurveyDraft {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== SURVEY_DRAFT_SCHEMA_VERSION) return false;
  if (value.roundId !== scope.roundId || value.contentVersionId !== scope.contentVersionId) {
    return false;
  }
  if (!Number.isInteger(value.currentStep) || typeof value.updatedAt !== "number") return false;
  if (!Number.isFinite(value.updatedAt) || value.updatedAt > now) return false;
  return now - value.updatedAt <= SURVEY_DRAFT_TTL_MS;
}

function restoreSurveyAnswers(
  storedAnswers: unknown,
  sections: readonly SurveySection[],
): SurveyAnswerState {
  const emptyAnswers = createSurveyAnswerState(sections);
  if (!isRecord(storedAnswers)) return emptyAnswers;

  return Object.fromEntries(
    getSurveyQuestions(sections).map((question) => {
      const emptyAnswer = emptyAnswers[question.questionId]!;
      return [
        question.questionId,
        restoreSurveyAnswer(question, storedAnswers[question.questionId], emptyAnswer),
      ];
    }),
  );
}

function restoreSurveyAnswer(
  question: SurveyQuestion,
  value: unknown,
  emptyAnswer: SurveyAnswerDraft,
): SurveyAnswerDraft {
  if (!isRecord(value) || value.type !== question.type) return emptyAnswer;

  switch (question.type) {
    case "SINGLE_CHOICE": {
      const optionId = readOptionId(value.selection);
      return optionId && hasOption(question, optionId)
        ? { type: question.type, selection: { optionId } }
        : emptyAnswer;
    }
    case "MULTIPLE_CHOICE": {
      if (!Array.isArray(value.selections)) return emptyAnswer;
      const optionIds = Array.from(
        new Set(
          value.selections
            .map(readOptionId)
            .filter((optionId): optionId is string =>
              Boolean(optionId && hasOption(question, optionId)),
            ),
        ),
      );
      return { type: question.type, selections: optionIds.map((optionId) => ({ optionId })) };
    }
    case "SHORT_TEXT":
    case "LONG_TEXT": {
      if (typeof value.text !== "string") return emptyAnswer;
      const inputSegments = Array.isArray(value.inputSegments)
        ? value.inputSegments.filter((segment): segment is string => typeof segment === "string")
        : undefined;
      const inputMethod =
        value.inputMethod === "MANUAL" || value.inputMethod === "POSTCODE"
          ? value.inputMethod
          : undefined;
      return {
        type: question.type,
        text: value.text,
        ...(inputMethod ? { inputMethod } : {}),
        ...(inputSegments ? { inputSegments } : {}),
      };
    }
    case "NUMBER":
      return typeof value.number === "number" && Number.isFinite(value.number)
        ? { type: question.type, number: value.number }
        : emptyAnswer;
    case "SCALE":
      return isValidScale(value.scale, question.minimum, question.maximum)
        ? { type: question.type, scale: value.scale }
        : emptyAnswer;
    case "MATRIX_SINGLE_CHOICE": {
      const storedItemAnswers = isRecord(value.itemAnswers) ? value.itemAnswers : {};
      return {
        type: question.type,
        itemAnswers: Object.fromEntries(
          question.items.map((item) => {
            const optionId = readOptionId(storedItemAnswers[item.itemId]);
            return [item.itemId, optionId && hasOption(question, optionId) ? { optionId } : null];
          }),
        ),
      };
    }
    case "MATRIX_SCALE": {
      const storedItemAnswers = isRecord(value.itemAnswers) ? value.itemAnswers : {};
      return {
        type: question.type,
        itemAnswers: Object.fromEntries(
          question.items.map((item) => {
            const scale = storedItemAnswers[item.itemId];
            return [
              item.itemId,
              isValidScale(scale, question.minimum, question.maximum) ? scale : null,
            ];
          }),
        ),
      };
    }
  }
}

function hasOption(
  question: Extract<
    SurveyQuestion,
    { type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "MATRIX_SINGLE_CHOICE" }
  >,
  optionId: string,
): boolean {
  return question.options.some((option) => option.optionId === optionId);
}

function readOptionId(value: unknown): string | null {
  return isRecord(value) ? readNonEmptyString(value.optionId) : null;
}

function isValidScale(value: unknown, minimum: number, maximum: number): value is number {
  return (
    Number.isInteger(value) && typeof value === "number" && value >= minimum && value <= maximum
  );
}

function clampStep(step: number, totalSteps: number): number {
  return Math.min(Math.max(step, 1), Math.max(totalSteps, 1));
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
