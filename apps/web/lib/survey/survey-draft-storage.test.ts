import { describe, expect, it, vi } from "vitest";
import type { SurveySection } from "./survey-contracts";
import {
  SURVEY_DRAFT_TTL_MS,
  createSurveyDraftStorageKey,
  loadSurveyDraft,
  removeSurveyDraft,
  resolveSurveyDraftOwnerKey,
  saveSurveyDraft,
  type SurveyDraftScope,
} from "./survey-draft-storage";

const ROUND_ID = "11111111-1111-4111-8111-111111111111";
const CONTENT_VERSION_ID = "22222222-2222-4222-8222-222222222222";
const SINGLE_ID = "33333333-3333-4333-8333-333333333333";
const MATRIX_ID = "44444444-4444-4444-8444-444444444444";
const ITEM_ID = "55555555-5555-4555-8555-555555555555";
const OPTION_YES = "66666666-6666-4666-8666-666666666666";
const OPTION_NO = "77777777-7777-4777-8777-777777777777";
const RESIDENCE_ID = "88888888-8888-4888-8888-888888888888";

const sections: readonly SurveySection[] = [
  {
    sectionKey: "section-one",
    title: "첫 번째",
    questions: [
      {
        questionId: SINGLE_ID,
        questionKey: "single",
        title: "단일 선택",
        prompt: "선택해 주세요",
        required: true,
        type: "SINGLE_CHOICE",
        options: [
          { optionId: OPTION_YES, label: "예" },
          { optionId: OPTION_NO, label: "아니오" },
        ],
      },
      {
        questionId: MATRIX_ID,
        questionKey: "matrix",
        title: "행렬 척도",
        prompt: "평가해 주세요",
        required: true,
        type: "MATRIX_SCALE",
        items: [{ itemId: ITEM_ID, itemKey: "item", itemLabel: "항목" }],
        minimum: 0,
        maximum: 10,
        minimumLabel: null,
        maximumLabel: null,
      },
    ],
  },
];

const scope: SurveyDraftScope = {
  contentVersionId: CONTENT_VERSION_ID,
  ownerKey: "owner-fingerprint",
  roundId: ROUND_ID,
};

describe("survey draft storage", () => {
  it("현재 사용자와 설문 버전의 답변 및 단계를 저장하고 복원한다", () => {
    const storage = new MemoryStorage();
    saveSurveyDraft(
      storage,
      scope,
      {
        answers: {
          [SINGLE_ID]: { type: "SINGLE_CHOICE", selection: { optionId: OPTION_YES } },
          [MATRIX_ID]: { type: "MATRIX_SCALE", itemAnswers: { [ITEM_ID]: 7 } },
        },
        currentStep: 2,
      },
      1_000,
    );

    expect(loadSurveyDraft(storage, scope, sections, 1_001)).toEqual({
      answers: {
        [SINGLE_ID]: { type: "SINGLE_CHOICE", selection: { optionId: OPTION_YES } },
        [MATRIX_ID]: { type: "MATRIX_SCALE", itemAnswers: { [ITEM_ID]: 7 } },
      },
      currentStep: 2,
    });
  });

  it("현재 API에 없는 Option과 범위를 벗어난 Item 답변은 복원하지 않는다", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      createSurveyDraftStorageKey(scope),
      JSON.stringify({
        answers: {
          [SINGLE_ID]: {
            type: "SINGLE_CHOICE",
            selection: { optionId: "88888888-8888-4888-8888-888888888888" },
          },
          [MATRIX_ID]: { type: "MATRIX_SCALE", itemAnswers: { [ITEM_ID]: 11 } },
        },
        contentVersionId: CONTENT_VERSION_ID,
        currentStep: 99,
        roundId: ROUND_ID,
        schemaVersion: 1,
        updatedAt: 1_000,
      }),
    );

    expect(loadSurveyDraft(storage, scope, sections, 1_001)).toEqual({
      answers: {
        [SINGLE_ID]: { type: "SINGLE_CHOICE", selection: null },
        [MATRIX_ID]: { type: "MATRIX_SCALE", itemAnswers: { [ITEM_ID]: null } },
      },
      currentStep: 2,
    });
  });

  it("주소 입력 방식과 세부 지역 값을 함께 복원한다", () => {
    const storage = new MemoryStorage();
    const residenceSections: readonly SurveySection[] = [
      {
        sectionKey: "personal-information",
        title: "일반 개인정보",
        questions: [
          {
            questionId: RESIDENCE_ID,
            questionKey: "demographics.residence",
            title: "주소지",
            prompt: "주소지를 선택해 주세요",
            required: true,
            type: "SHORT_TEXT",
            maxLength: 200,
          },
        ],
      },
    ];
    saveSurveyDraft(
      storage,
      scope,
      {
        answers: {
          [RESIDENCE_ID]: {
            type: "SHORT_TEXT",
            inputMethod: "POSTCODE",
            inputSegments: ["세종특별자치시", "", "나성동"],
            text: "세종특별자치시 나성동",
          },
        },
        currentStep: 1,
      },
      1_000,
    );

    expect(loadSurveyDraft(storage, scope, residenceSections, 1_001)).toEqual({
      answers: {
        [RESIDENCE_ID]: {
          type: "SHORT_TEXT",
          inputMethod: "POSTCODE",
          inputSegments: ["세종특별자치시", "", "나성동"],
          text: "세종특별자치시 나성동",
        },
      },
      currentStep: 1,
    });
  });

  it("만료되거나 손상된 임시 답변을 폐기한다", () => {
    const storage = new MemoryStorage();
    saveSurveyDraft(storage, scope, { answers: {}, currentStep: 1 }, 1_000);

    expect(loadSurveyDraft(storage, scope, sections, 1_000 + SURVEY_DRAFT_TTL_MS + 1)).toBeNull();
    expect(storage.getItem(createSurveyDraftStorageKey(scope))).toBeNull();

    storage.setItem(createSurveyDraftStorageKey(scope), "not-json");
    expect(loadSurveyDraft(storage, scope, sections, 2_000)).toBeNull();
    expect(storage.getItem(createSurveyDraftStorageKey(scope))).toBeNull();
  });

  it("저장소 장애가 설문 입력과 제출 완료 처리를 막지 않는다", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      removeItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(() => {
        throw new Error("blocked");
      }),
    };

    expect(loadSurveyDraft(storage, scope, sections)).toBeNull();
    expect(() => saveSurveyDraft(storage, scope, { answers: {}, currentStep: 1 })).not.toThrow();
    expect(() => removeSurveyDraft(storage, scope)).not.toThrow();
  });

  it("인증 subject 원문 대신 안정적인 SHA-256 owner key를 만든다", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ subject: "user-1" }));

    const ownerKey = await resolveSurveyDraftOwnerKey(request);

    expect(ownerKey).toMatch(/^[a-f0-9]{64}$/);
    expect(ownerKey).not.toContain("user-1");
    expect(request).toHaveBeenCalledWith("/api/v1/auth/me", {
      cache: "no-store",
      credentials: "same-origin",
      method: "GET",
    });
  });
});

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
