import { describe, expect, it } from "vitest";
import { presentOpenTask } from "./vote-task-list-presentation";

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
    expect(item.supportingText).toMatch(/참여 완료$/);
  });
});
