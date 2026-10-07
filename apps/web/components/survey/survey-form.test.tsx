// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeatureFailureAnalyticsSession } from "@/lib/analytics/feature-failure-analytics";
import type { SubmissionResponse, SurveySection } from "@/lib/survey/survey-contracts";
import type { SurveyAnswerState } from "@/lib/survey/survey-answer-state";
import { SurveyForm } from "./survey-screen";

const submissionHarness = vi.hoisted(() => ({
  acceptConsent: vi.fn(),
  clearDraft: vi.fn(),
  coordinatorReset: vi.fn(),
  coordinatorSubmit: vi.fn(),
  currentDraftParams: null as unknown,
  onRefresh: vi.fn(),
  onSubmitted: vi.fn(),
  submitSurvey: vi.fn(),
  trackFailure: vi.fn(),
  trackRecovered: vi.fn(),
  trackRecoveryAttempt: vi.fn(),
  trackStepExited: vi.fn(),
  trackSubmissionAttempted: vi.fn(),
}));

const recoveryHarness = vi.hoisted(() => ({
  classifySurveySubmissionError: vi.fn(),
}));

vi.mock("@/lib/consent/consent-queries", () => ({
  useAcceptSensitiveSurveyConsentMutation: () => ({
    isPending: false,
    mutateAsync: submissionHarness.acceptConsent,
  }),
}));

vi.mock("@/lib/survey/survey-queries", () => ({
  useCurrentSurveyQuery: vi.fn(),
  useSubmitSurveyMutation: () => ({
    isPending: false,
    mutateAsync: submissionHarness.submitSurvey,
  }),
}));

vi.mock("@/lib/survey/survey-submission-coordinator", () => ({
  SurveySubmissionCoordinator: class MockSurveySubmissionCoordinator {
    readonly reset = submissionHarness.coordinatorReset;
    readonly submit = submissionHarness.coordinatorSubmit;
  },
}));

vi.mock("@/lib/survey/survey-submission-recovery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/survey/survey-submission-recovery")>();

  return {
    ...actual,
    classifySurveySubmissionError: recoveryHarness.classifySurveySubmissionError,
  };
});

vi.mock("./use-survey-draft-session", () => ({
  useSurveyDraftSession: (params: unknown) => {
    submissionHarness.currentDraftParams = params;
    return {
      clearDraft: submissionHarness.clearDraft,
      draftReady: true,
      entryType: "new",
    };
  },
}));

vi.mock("./use-survey-participation-analytics", () => ({
  useSurveyParticipationAnalytics: () => ({
    trackStepExited: submissionHarness.trackStepExited,
    trackSubmissionAttempted: submissionHarness.trackSubmissionAttempted,
  }),
}));

const FIRST_QUESTION_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_QUESTION_ID = "22222222-2222-4222-8222-222222222222";
const SUBMISSION_RESULT = {
  submissionId: "33333333-3333-4333-8333-333333333333",
} as unknown as SubmissionResponse;

const SECTIONS: readonly SurveySection[] = [
  {
    sectionKey: "first-section",
    title: "첫 번째 단계",
    questions: [
      {
        maxLength: 100,
        prompt: "첫 번째 답변",
        questionId: FIRST_QUESTION_ID,
        questionKey: "test.first",
        required: true,
        title: "첫 번째 질문",
        type: "SHORT_TEXT",
      },
    ],
  },
  {
    sectionKey: "second-section",
    title: "두 번째 단계",
    questions: [
      {
        maxLength: 100,
        prompt: "두 번째 답변",
        questionId: SECOND_QUESTION_ID,
        questionKey: "test.second",
        required: true,
        title: "두 번째 질문",
        type: "SHORT_TEXT",
      },
    ],
  },
];

describe("SurveyForm", () => {
  beforeEach(() => {
    for (const mock of [
      submissionHarness.acceptConsent,
      submissionHarness.clearDraft,
      submissionHarness.coordinatorReset,
      submissionHarness.coordinatorSubmit,
      submissionHarness.onRefresh,
      submissionHarness.onSubmitted,
      submissionHarness.submitSurvey,
      submissionHarness.trackFailure,
      submissionHarness.trackRecovered,
      submissionHarness.trackRecoveryAttempt,
      submissionHarness.trackStepExited,
      submissionHarness.trackSubmissionAttempted,
      recoveryHarness.classifySurveySubmissionError,
    ]) {
      mock.mockReset();
    }
    submissionHarness.currentDraftParams = null;
    submissionHarness.coordinatorSubmit.mockResolvedValue(SUBMISSION_RESULT);
    submissionHarness.trackFailure.mockReturnValue(true);
    submissionHarness.trackRecovered.mockReturnValue(true);
    submissionHarness.trackRecoveryAttempt.mockReturnValue(true);
    submissionHarness.trackStepExited.mockReturnValue(true);
    submissionHarness.trackSubmissionAttempted.mockReturnValue(true);
    recoveryHarness.classifySurveySubmissionError.mockReturnValue({
      fieldErrors: {},
      message: "설문 제출 중 오류가 발생했습니다.",
      newAttempt: true,
      refresh: false,
    });
    vi.stubGlobal("requestAnimationFrame", vi.fn().mockReturnValue(1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("현재 section 검증, 답변 오류 해제, 다음·이전 단계 이동과 답변 유지를 연결한다", () => {
    const rendered = renderSurveyForm();

    expect(rendered.container.querySelector("[data-survey-step='1']")).not.toBeNull();
    expect(screen.getByText("1/3")).toBeTruthy();
    expect(screen.getByRole("link", { name: "취소하기" }).getAttribute("href")).toBe("/home");

    fireEvent.click(screen.getByRole("button", { name: "다음으로" }));

    expect(rendered.container.querySelector("[data-survey-step='1']")).not.toBeNull();
    expect(rendered.container.querySelector("[data-invalid='true']")).not.toBeNull();
    expect(requestAnimationFrame).toHaveBeenCalledOnce();

    fireEvent.change(screen.getByLabelText("첫 번째 답변"), {
      target: { value: "첫 번째 입력값" },
    });
    expect(rendered.container.querySelector("[data-invalid='true']")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "다음으로" }));
    expect(rendered.container.querySelector("[data-survey-step='2']")).not.toBeNull();
    expect(screen.getByText("2/3")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "이전으로" }));
    expect(rendered.container.querySelector("[data-survey-step='1']")).not.toBeNull();
    expect((screen.getByLabelText("첫 번째 답변") as HTMLInputElement).value).toBe(
      "첫 번째 입력값",
    );
    expect(submissionHarness.trackStepExited).toHaveBeenCalledWith("next");
    expect(submissionHarness.trackStepExited).toHaveBeenCalledWith("previous");
  });

  it("draft가 복원한 답변과 단계를 동일한 form 상태에 반영한다", () => {
    const rendered = renderSurveyForm();
    const draft = getDraftParams();
    const restoredAnswers: SurveyAnswerState = {
      [FIRST_QUESTION_ID]: { text: "복원된 첫 답변", type: "SHORT_TEXT" },
      [SECOND_QUESTION_ID]: { text: "복원된 둘째 답변", type: "SHORT_TEXT" },
    };

    act(() => {
      draft.onDraftRestored({ answers: restoredAnswers, currentStep: 2 });
    });

    expect(rendered.container.querySelector("[data-survey-step='2']")).not.toBeNull();
    expect((screen.getByLabelText("두 번째 답변") as HTMLInputElement).value).toBe(
      "복원된 둘째 답변",
    );
    fireEvent.click(screen.getByRole("button", { name: "이전으로" }));
    expect((screen.getByLabelText("첫 번째 답변") as HTMLInputElement).value).toBe(
      "복원된 첫 답변",
    );
  });

  it("마지막 단계로 복원된 불완전 draft를 제출 전에 전체 검증하고 첫 오류 단계로 이동한다", () => {
    const rendered = renderSurveyForm();
    const draft = getDraftParams();

    act(() => {
      draft.onDraftRestored({
        answers: {
          [FIRST_QUESTION_ID]: { text: "", type: "SHORT_TEXT" },
          [SECOND_QUESTION_ID]: { text: "복원된 둘째 답변", type: "SHORT_TEXT" },
        },
        currentStep: 3,
      });
    });
    expect(rendered.container.querySelector("[data-survey-step='3']")).not.toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: /민감정보 수집·이용에 동의합니다/ }));
    fireEvent.click(screen.getByRole("button", { name: "제출하기" }));

    expect(rendered.container.querySelector("[data-survey-step='1']")).not.toBeNull();
    expect(rendered.container.querySelector("[data-invalid='true']")).not.toBeNull();
    expect(screen.getByText("답변을 입력해 주세요.")).toBeTruthy();
    expect(requestAnimationFrame).toHaveBeenCalled();
    expect(submissionHarness.coordinatorSubmit).not.toHaveBeenCalled();
    expect(submissionHarness.acceptConsent).not.toHaveBeenCalled();
    expect(submissionHarness.submitSurvey).not.toHaveBeenCalled();
    expect(submissionHarness.trackSubmissionAttempted).not.toHaveBeenCalled();
  });

  it("마지막 단계에서 필수 동의 전에는 제출을 막고 동의 후 성공 결과를 전달한다", async () => {
    renderSurveyForm();
    completeSurveyAnswers();
    const submit = screen.getByRole("button", { name: "제출하기" });
    const consent = screen.getByRole("checkbox", { name: /민감정보 수집·이용에 동의합니다/ });

    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(consent);
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    expect(submissionHarness.coordinatorReset).toHaveBeenCalledOnce();

    fireEvent.click(submit);

    await waitFor(() => {
      expect(submissionHarness.onSubmitted).toHaveBeenCalledWith(SUBMISSION_RESULT);
    });
    expect(submissionHarness.coordinatorSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: expect.objectContaining({
          [FIRST_QUESTION_ID]: { text: "첫 번째 입력값", type: "SHORT_TEXT" },
          [SECOND_QUESTION_ID]: { text: "두 번째 입력값", type: "SHORT_TEXT" },
        }),
        clientClickedAt: expect.any(String),
        roundId: "survey-round-01",
      }),
    );
    expect(submissionHarness.clearDraft).toHaveBeenCalledOnce();
    expect(submissionHarness.trackSubmissionAttempted).toHaveBeenCalledOnce();
    expect(submissionHarness.trackStepExited).toHaveBeenCalledWith("submit");
  });

  it("서버 field 오류를 첫 invalid section으로 이동시키고 제출 오류와 새 시도를 표시한다", async () => {
    const submissionError = new Error("server validation failed");
    submissionHarness.coordinatorSubmit.mockRejectedValue(submissionError);
    recoveryHarness.classifySurveySubmissionError.mockReturnValue({
      fieldErrors: { [FIRST_QUESTION_ID]: "서버가 첫 답변을 거부했습니다." },
      message: "입력값을 다시 확인해 주세요.",
      newAttempt: true,
      refresh: false,
    });
    const rendered = renderSurveyForm();
    completeSurveyAnswers();
    fireEvent.click(screen.getByRole("checkbox", { name: /민감정보 수집·이용에 동의합니다/ }));

    fireEvent.click(screen.getByRole("button", { name: "제출하기" }));

    await waitFor(() => {
      expect(rendered.container.querySelector("[data-survey-step='1']")).not.toBeNull();
    });
    expect(screen.getByText("서버가 첫 답변을 거부했습니다.")).toBeTruthy();
    expect(screen.getByText("입력값을 다시 확인해 주세요.").getAttribute("role")).toBe("alert");
    expect(submissionHarness.coordinatorReset).toHaveBeenCalledTimes(2);
    expect(submissionHarness.onRefresh).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(requestAnimationFrame).toHaveBeenCalled();
    });
  });
});

function renderSurveyForm() {
  const failureAnalytics: FeatureFailureAnalyticsSession = {
    trackFailure: submissionHarness.trackFailure,
    trackRecovered: submissionHarness.trackRecovered,
    trackRecoveryAttempt: submissionHarness.trackRecoveryAttempt,
  };

  return render(
    <SurveyForm
      cancelHref="/home"
      contentVersionId="survey-version-01"
      failureAnalytics={failureAnalytics}
      onHeaderBackActionChange={vi.fn()}
      onHeaderProgressChange={vi.fn()}
      onRefresh={submissionHarness.onRefresh}
      onSubmitted={submissionHarness.onSubmitted}
      roundId="survey-round-01"
      sections={SECTIONS}
    />,
  );
}

function completeSurveyAnswers() {
  fireEvent.change(screen.getByLabelText("첫 번째 답변"), {
    target: { value: "첫 번째 입력값" },
  });
  fireEvent.click(screen.getByRole("button", { name: "다음으로" }));
  fireEvent.change(screen.getByLabelText("두 번째 답변"), {
    target: { value: "두 번째 입력값" },
  });
  fireEvent.click(screen.getByRole("button", { name: "다음으로" }));
}

function getDraftParams(): {
  onDraftRestored: (draft: Readonly<{ answers: SurveyAnswerState; currentStep: number }>) => void;
} {
  const params = submissionHarness.currentDraftParams;

  if (!params || typeof params !== "object") {
    throw new Error("draft session params가 준비되지 않았습니다.");
  }

  return params as {
    onDraftRestored: (
      draft: Readonly<{
        answers: SurveyAnswerState;
        currentStep: number;
      }>,
    ) => void;
  };
}
