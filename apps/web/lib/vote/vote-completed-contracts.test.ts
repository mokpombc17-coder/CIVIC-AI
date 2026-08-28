import { describe, expect, it } from "vitest";
import { calculateVotePercentage, completedTaskPageSchema } from "./vote-completed-contracts";

describe("completedTaskPageSchema", () => {
  it("Backend local fixture의 canonical UUID 형태 ID를 임시로 수용한다", () => {
    expect(
      completedTaskPageSchema.safeParse({
        items: [
          {
            taskId: "13000000-0000-0000-0000-000000000005",
            title: "완료 과업",
            description: "local fixture",
            openedAt: "2026-08-18T00:00:00Z",
            closedAt: "2026-08-28T04:53:00Z",
            closureType: "EARLY_CLOSED",
            mySubmission: {
              submissionId: "63485610-92f5-44ca-adde-46f83f8576b6",
              submittedAt: "2026-08-28T04:53:00Z",
            },
          },
        ],
        nextCursor: null,
      }).success,
    ).toBe(true);
  });

  it("UUID 형태가 아닌 ID는 계속 거절한다", () => {
    expect(
      completedTaskPageSchema.safeParse({
        items: [
          {
            taskId: "local-task-5",
            title: "완료 과업",
            description: "local fixture",
            openedAt: "2026-08-18T00:00:00Z",
            closedAt: "2026-08-28T04:53:00Z",
            closureType: "EARLY_CLOSED",
            mySubmission: {
              submissionId: "63485610-92f5-44ca-adde-46f83f8576b6",
              submittedAt: "2026-08-28T04:53:00Z",
            },
          },
        ],
        nextCursor: null,
      }).success,
    ).toBe(false);
  });
});

describe("calculateVotePercentage", () => {
  it("응답이 0이면 NaN이나 Infinity 대신 0을 반환한다", () => {
    expect(calculateVotePercentage(0, 0)).toBe(0);
  });

  it("Backend count를 백분율로 변환한다", () => {
    expect(calculateVotePercentage(72, 120)).toBe(60);
  });
});
