import { describe, expect, it } from "vitest";
import {
  presentOpenTask,
  presentSearchTask,
  sortCompletedTasksByLatest,
  sortOpenTasksByLatest,
} from "./vote-task-list-presentation";

const TASK_ID = "0f6e8c4f-87d0-4f6e-87b7-c3635c3c96b7";
const SUBMISSION_ID = "4aa0ba2e-7485-40d8-873c-49a64a1adf0c";

describe("Vote task list presentation", () => {
  it("미제출 열린 과업을 진행 중 참여 카드로 변환한다", () => {
    const item = presentOpenTask({
      taskId: TASK_ID,
      title: "청년 주거 지원 정책",
      description: null,
      openedAt: "2026-08-27T00:00:00Z",
      closesAt: "2026-08-30T00:00:00Z",
      submission: { submitted: false, submissionId: null, submittedAt: null },
    });

    expect(item).toMatchObject({
      statusLabel: "진행 중",
      actionLabel: "참여하기",
      actionHref: `/vote/${TASK_ID}`,
    });
    expect(item.supportingText).toMatch(/마감$/);
  });

  it("제출한 열린 과업을 참여 완료 응답 보기 카드로 변환한다", () => {
    const item = presentOpenTask({
      taskId: TASK_ID,
      title: "청년 주거 지원 정책",
      description: "설명",
      openedAt: "2026-08-27T00:00:00Z",
      closesAt: "2026-08-30T00:00:00Z",
      submission: {
        submitted: true,
        submissionId: SUBMISSION_ID,
        submittedAt: "2026-08-28T03:00:00Z",
      },
    });

    expect(item).toMatchObject({
      statusLabel: "참여 완료",
      actionLabel: "응답 보기",
      actionHref: `/vote/${TASK_ID}`,
    });
    expect(item.supportingText).toMatch(/마감$/);
  });

  it("진행 중인 투표를 열린 시각 기준 최신순으로 정렬한다", () => {
    const olderTask = {
      taskId: "11111111-1111-1111-1111-111111111111",
      title: "이전 투표",
      description: null,
      openedAt: "2026-08-20T00:00:00Z",
      closesAt: "2026-08-31T00:00:00Z",
      submission: { submitted: false as const, submissionId: null, submittedAt: null },
    };
    const latestTask = {
      ...olderTask,
      taskId: "22222222-2222-2222-2222-222222222222",
      title: "최신 투표",
      openedAt: "2026-08-28T00:00:00Z",
    };

    expect(sortOpenTasksByLatest([olderTask, latestTask]).map((task) => task.title)).toEqual([
      "최신 투표",
      "이전 투표",
    ]);
  });

  it("완료된 투표를 종료 시각 기준 최신순으로 정렬한다", () => {
    const olderTask = {
      taskId: "11111111-1111-1111-1111-111111111111",
      title: "이전 완료 투표",
      description: "설명",
      openedAt: "2026-08-10T00:00:00Z",
      closedAt: "2026-08-20T00:00:00Z",
      closureType: "DEADLINE_REACHED" as const,
      mySubmission: {
        submissionId: SUBMISSION_ID,
        submittedAt: "2026-08-15T00:00:00Z",
      },
    };
    const latestTask = {
      ...olderTask,
      taskId: "22222222-2222-2222-2222-222222222222",
      title: "최신 완료 투표",
      closedAt: "2026-08-29T00:00:00Z",
    };

    expect(sortCompletedTasksByLatest([olderTask, latestTask]).map((task) => task.title)).toEqual([
      "최신 완료 투표",
      "이전 완료 투표",
    ]);
  });

  it("통합 검색 결과를 상태와 제출 여부에 맞는 action으로 변환한다", () => {
    expect(
      presentSearchTask({
        taskId: TASK_ID,
        title: "진행 중 투표",
        description: null,
        taskStatus: "OPEN",
        openedAt: "2026-10-01T00:00:00Z",
        closesAt: "2026-10-15T00:00:00Z",
        closedAt: null,
        closureType: null,
        mySubmission: { submissionId: SUBMISSION_ID, submittedAt: "2026-10-02T00:00:00Z" },
        resultAvailable: false,
      }),
    ).toMatchObject({ statusLabel: "참여 완료", actionLabel: "응답 보기" });

    expect(
      presentSearchTask({
        taskId: TASK_ID,
        title: "완료 투표",
        description: null,
        taskStatus: "CLOSED",
        openedAt: "2026-09-01T00:00:00Z",
        closesAt: "2026-09-15T00:00:00Z",
        closedAt: "2026-09-15T00:00:00Z",
        closureType: "DEADLINE_REACHED",
        mySubmission: { submissionId: SUBMISSION_ID, submittedAt: "2026-09-05T00:00:00Z" },
        resultAvailable: false,
      }),
    ).toMatchObject({
      statusLabel: "완료",
      actionLabel: "결과 준비 중",
      actionHref: null,
    });
  });
});
