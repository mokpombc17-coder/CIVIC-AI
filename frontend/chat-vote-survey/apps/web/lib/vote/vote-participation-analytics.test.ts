import { describe, expect, it, vi } from "vitest";
import {
  createVoteParticipationAnalyticsSession,
  resolveVoteInitialAiState,
} from "./vote-participation-analytics";

describe("resolveVoteInitialAiState", () => {
  it("최초 화면에서 참여 가능한 상태를 우선한다", () => {
    expect(resolveVoteInitialAiState({ participationReady: true, preparationFailed: true })).toBe(
      "ready",
    );
  });

  it("참여 불가능한 실패 상태와 대기 상태를 구분한다", () => {
    expect(resolveVoteInitialAiState({ participationReady: false, preparationFailed: true })).toBe(
      "failed",
    );
    expect(resolveVoteInitialAiState({ participationReady: false, preparationFailed: false })).toBe(
      "waiting",
    );
  });
});

describe("createVoteParticipationAnalyticsSession", () => {
  it("단계별 최초 노출만 기록하고 1단계에는 최초 AI 상태를 포함한다", () => {
    const sendEvent = vi.fn().mockReturnValue(true);
    const session = createVoteParticipationAnalyticsSession({
      sendEvent,
      taskId: "task-1",
      visitId: "visit-1",
    });

    expect(session.trackStepViewed(1, "waiting")).toBe(true);
    expect(session.trackStepViewed(1, "ready")).toBe(false);
    expect(session.trackStepViewed(2)).toBe(true);
    expect(session.trackStepViewed(2)).toBe(false);

    expect(sendEvent).toHaveBeenNthCalledWith(1, "vote_step_view", {
      initial_ai_state: "waiting",
      step: 1,
      task_id: "task-1",
      visit_id: "visit-1",
    });
    expect(sendEvent).toHaveBeenNthCalledWith(2, "vote_step_view", {
      step: 2,
      task_id: "task-1",
      visit_id: "visit-1",
    });
  });

  it("1단계 노출부터 참여 가능 표시까지의 시간을 한 번만 기록한다", () => {
    let now = 1_000;
    const sendEvent = vi.fn().mockReturnValue(true);
    const session = createVoteParticipationAnalyticsSession({
      now: () => now,
      sendEvent,
      taskId: "task-1",
      visitId: "visit-1",
    });

    expect(session.trackParticipationReady()).toBe(false);
    expect(session.trackStepViewed(1, "waiting")).toBe(true);
    now = 1_240;
    expect(session.trackParticipationReady()).toBe(true);
    expect(session.trackParticipationReady()).toBe(false);

    expect(sendEvent).toHaveBeenLastCalledWith("vote_participation_ready", {
      task_id: "task-1",
      visit_id: "visit-1",
      wait_duration_ms: 240,
    });
  });

  it("실제 제출 요청마다 방문 내 시도 순서를 증가시킨다", () => {
    const sendEvent = vi.fn().mockReturnValue(true);
    const session = createVoteParticipationAnalyticsSession({
      sendEvent,
      taskId: "task-1",
      visitId: "visit-1",
    });

    expect(session.trackSubmissionAttempted()).toBe(true);
    expect(session.trackSubmissionAttempted()).toBe(true);

    expect(sendEvent).toHaveBeenNthCalledWith(1, "vote_submission_attempted", {
      attempt_number: 1,
      task_id: "task-1",
      visit_id: "visit-1",
    });
    expect(sendEvent).toHaveBeenNthCalledWith(2, "vote_submission_attempted", {
      attempt_number: 2,
      task_id: "task-1",
      visit_id: "visit-1",
    });
  });

  it("전송이 실패한 단계와 준비 완료는 후속 호출에서 다시 시도한다", () => {
    const sendEvent = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const session = createVoteParticipationAnalyticsSession({
      sendEvent,
      taskId: "task-1",
      visitId: "visit-1",
    });

    expect(session.trackStepViewed(1, "ready")).toBe(false);
    expect(session.trackStepViewed(1, "ready")).toBe(true);
    expect(session.trackParticipationReady()).toBe(true);
  });
});
