import { describe, expect, it, vi } from "vitest";
import {
  createSurveyParticipationAnalyticsSession,
  type SurveyAnalyticsEventSender,
  type SurveyEntryType,
} from "./survey-participation-analytics";

function createSession({
  entryType = "new",
  now = () => 1_000,
  sendEvent = vi.fn().mockReturnValue(true),
}: {
  entryType?: SurveyEntryType;
  now?: () => number;
  sendEvent?: SurveyAnalyticsEventSender;
} = {}) {
  return {
    sendEvent,
    session: createSurveyParticipationAnalyticsSession({
      entryType,
      now,
      sendEvent,
      surveyId: "round-1",
      surveyVersion: "version-1",
      totalSteps: 3,
      visitId: "visit-1",
    }),
  };
}

describe("createSurveyParticipationAnalyticsSession", () => {
  it("방문에서 단계별 최초 노출만 설문 문맥과 함께 기록한다", () => {
    const { sendEvent, session } = createSession({ entryType: "resumed" });

    session.setPageVisible(true);
    expect(session.trackStepViewed(2, "profile")).toBe(true);
    expect(session.trackStepViewed(2, "profile")).toBe(false);

    expect(sendEvent).toHaveBeenCalledOnce();
    expect(sendEvent).toHaveBeenCalledWith("survey_step_view", {
      entry_type: "resumed",
      step: 2,
      step_id: "profile",
      survey_id: "round-1",
      survey_version: "version-1",
      total_steps: 3,
      visit_id: "visit-1",
    });
  });

  it("화면이 실제로 보인 시간만 단계 이탈에 기록한다", () => {
    let now = 1_000;
    const { sendEvent, session } = createSession({ now: () => now });

    session.setPageVisible(true);
    session.trackStepViewed(1, "household");
    now = 1_300;
    session.setPageVisible(false);
    now = 2_300;
    session.setPageVisible(true);
    now = 2_500;
    expect(session.trackStepExited("next")).toBe(true);

    expect(sendEvent).toHaveBeenLastCalledWith("survey_step_exited", {
      active_duration_ms: 500,
      entry_type: "new",
      exit_type: "next",
      step: 1,
      step_id: "household",
      step_visit_number: 1,
      survey_id: "round-1",
      survey_version: "version-1",
      total_steps: 3,
      visit_id: "visit-1",
    });
  });

  it("같은 단계에 다시 머무르면 노출은 중복하지 않고 별도 체류 구간으로 기록한다", () => {
    let now = 1_000;
    const { sendEvent, session } = createSession({ now: () => now });

    session.setPageVisible(true);
    session.trackStepViewed(1, "household");
    now = 1_100;
    session.trackStepExited("next");
    session.trackStepViewed(2, "profile");
    now = 1_200;
    session.trackStepExited("previous");
    expect(session.trackStepViewed(1, "household")).toBe(false);
    now = 1_350;
    session.trackStepExited("leave");

    expect(sendEvent).toHaveBeenLastCalledWith(
      "survey_step_exited",
      expect.objectContaining({
        active_duration_ms: 150,
        step: 1,
        step_visit_number: 2,
      }),
    );
  });

  it("실제 제출 요청마다 방문 내 시도 순서를 증가시킨다", () => {
    const { sendEvent, session } = createSession();

    expect(session.trackSubmissionAttempted()).toBe(true);
    expect(session.trackSubmissionAttempted()).toBe(true);

    expect(sendEvent).toHaveBeenNthCalledWith(1, "survey_submission_attempted", {
      attempt_number: 1,
      entry_type: "new",
      survey_id: "round-1",
      survey_version: "version-1",
      total_steps: 3,
      visit_id: "visit-1",
    });
    expect(sendEvent).toHaveBeenNthCalledWith(2, "survey_submission_attempted", {
      attempt_number: 2,
      entry_type: "new",
      survey_id: "round-1",
      survey_version: "version-1",
      total_steps: 3,
      visit_id: "visit-1",
    });
  });
});
