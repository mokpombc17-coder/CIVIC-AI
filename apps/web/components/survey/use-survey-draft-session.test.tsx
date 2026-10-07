// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SurveyAnswerState } from "@/lib/survey/survey-answer-state";
import type { SurveySection } from "@/lib/survey/survey-contracts";
import { useSurveyDraftSession } from "./use-survey-draft-session";

const draftStorageHarness = vi.hoisted(() => ({
  loadSurveyDraft: vi.fn(),
  removeSurveyDraft: vi.fn(),
  resolveSurveyDraftOwnerKey: vi.fn(),
  saveSurveyDraft: vi.fn(),
}));

vi.mock("@/lib/survey/survey-draft-storage", () => ({
  loadSurveyDraft: draftStorageHarness.loadSurveyDraft,
  removeSurveyDraft: draftStorageHarness.removeSurveyDraft,
  resolveSurveyDraftOwnerKey: draftStorageHarness.resolveSurveyDraftOwnerKey,
  saveSurveyDraft: draftStorageHarness.saveSurveyDraft,
}));

const QUESTION_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_KEY = "owner-key-01";
const ROUND_ID = "survey-round-01";
const CONTENT_VERSION_ID = "survey-version-01";
const SCOPE = {
  contentVersionId: CONTENT_VERSION_ID,
  ownerKey: OWNER_KEY,
  roundId: ROUND_ID,
} as const;
const SECTIONS: readonly SurveySection[] = [
  {
    sectionKey: "profile",
    title: "기본 정보",
    questions: [
      {
        maxLength: 100,
        prompt: "답변",
        questionId: QUESTION_ID,
        questionKey: "profile.answer",
        required: true,
        title: "질문",
        type: "SHORT_TEXT",
      },
    ],
  },
];
const EMPTY_ANSWERS: SurveyAnswerState = {
  [QUESTION_ID]: { text: "", type: "SHORT_TEXT" },
};
const UPDATED_ANSWERS: SurveyAnswerState = {
  [QUESTION_ID]: { text: "최신 답변", type: "SHORT_TEXT" },
};

type HookParams = Parameters<typeof useSurveyDraftSession>[0];

describe("useSurveyDraftSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    for (const mock of Object.values(draftStorageHarness)) {
      mock.mockReset();
    }
    draftStorageHarness.resolveSurveyDraftOwnerKey.mockResolvedValue(OWNER_KEY);
    draftStorageHarness.loadSurveyDraft.mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("유효한 draft를 한 번만 복원하고 resumed 진입으로 표시한다", async () => {
    const restoredAnswers: SurveyAnswerState = {
      [QUESTION_ID]: { text: "복원된 답변", type: "SHORT_TEXT" },
    };
    draftStorageHarness.loadSurveyDraft.mockReturnValue({
      answers: restoredAnswers,
      currentStep: 2,
    });
    const params = createHookParams();
    const rendered = renderDraftSession(params);

    await flushEffects();

    expect(draftStorageHarness.loadSurveyDraft).toHaveBeenCalledWith(
      sessionStorage,
      SCOPE,
      SECTIONS,
    );
    expect(params.onDraftRestored).toHaveBeenCalledOnce();
    expect(params.onDraftRestored).toHaveBeenCalledWith({
      answers: restoredAnswers,
      currentStep: 2,
    });
    expect(rendered.result.current).toMatchObject({ draftReady: true, entryType: "resumed" });

    rendered.rerender({ ...params, answers: restoredAnswers, currentStep: 2 });
    await flushEffects();

    expect(draftStorageHarness.loadSurveyDraft).toHaveBeenCalledOnce();
    expect(params.onDraftRestored).toHaveBeenCalledOnce();
  });

  it.each([
    { expectedLoadCount: 1, label: "저장된 draft가 없을 때", ownerKey: OWNER_KEY },
    { expectedLoadCount: 0, label: "사용자 식별자가 없을 때", ownerKey: null },
  ])("$label new 진입으로 표시한다", async ({ expectedLoadCount, ownerKey }) => {
    draftStorageHarness.resolveSurveyDraftOwnerKey.mockResolvedValue(ownerKey);
    const params = createHookParams();
    const { result } = renderDraftSession(params);

    await flushEffects();

    expect(result.current).toMatchObject({ draftReady: true, entryType: "new" });
    expect(params.onDraftRestored).not.toHaveBeenCalled();
    expect(draftStorageHarness.loadSurveyDraft).toHaveBeenCalledTimes(expectedLoadCount);
  });

  it("답변과 단계 변경을 debounce하고 최신 snapshot만 저장한다", async () => {
    const params = createHookParams();
    const rendered = renderDraftSession(params);
    await flushEffects();

    rendered.rerender({ ...params, answers: UPDATED_ANSWERS, currentStep: 2 });
    await advanceDraftSaveTimer(199);
    expect(draftStorageHarness.saveSurveyDraft).not.toHaveBeenCalled();

    await advanceDraftSaveTimer(1);

    expect(draftStorageHarness.saveSurveyDraft).toHaveBeenCalledOnce();
    expect(draftStorageHarness.saveSurveyDraft).toHaveBeenCalledWith(sessionStorage, SCOPE, {
      answers: UPDATED_ANSWERS,
      currentStep: 2,
    });
  });

  it("clearDraft는 대기 중 저장을 취소하고 현재 scope의 draft를 제거한다", async () => {
    const { result } = renderDraftSession(createHookParams());
    await flushEffects();

    act(() => {
      result.current.clearDraft();
    });
    await advanceDraftSaveTimer(200);

    expect(draftStorageHarness.saveSurveyDraft).not.toHaveBeenCalled();
    expect(draftStorageHarness.removeSurveyDraft).toHaveBeenCalledOnce();
    expect(draftStorageHarness.removeSurveyDraft).toHaveBeenCalledWith(sessionStorage, SCOPE);
  });

  it("사용자 식별 조회 중 unmount되면 늦은 draft 복원을 무시한다", async () => {
    const owner = createDeferred<string | null>();
    draftStorageHarness.resolveSurveyDraftOwnerKey.mockReturnValue(owner.promise);
    const params = createHookParams();
    const rendered = renderDraftSession(params);

    rendered.unmount();
    await act(async () => {
      owner.resolve(OWNER_KEY);
      await Promise.resolve();
    });
    await advanceDraftSaveTimer(200);

    expect(draftStorageHarness.loadSurveyDraft).not.toHaveBeenCalled();
    expect(params.onDraftRestored).not.toHaveBeenCalled();
    expect(draftStorageHarness.saveSurveyDraft).not.toHaveBeenCalled();
  });
});

function createHookParams(overrides: Partial<HookParams> = {}): HookParams {
  return {
    answers: EMPTY_ANSWERS,
    contentVersionId: CONTENT_VERSION_ID,
    currentStep: 1,
    onDraftRestored: vi.fn(),
    roundId: ROUND_ID,
    sections: SECTIONS,
    ...overrides,
  };
}

function renderDraftSession(initialProps: HookParams) {
  return renderHook((params: HookParams) => useSurveyDraftSession(params), { initialProps });
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function advanceDraftSaveTimer(milliseconds: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

function createDeferred<T>(): Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
}> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
