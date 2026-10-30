import { describe, expect, it } from "vitest";
import { searchTaskPageSchema, searchTaskParamsSchema } from "./vote-task-search-contracts";

const TASK_ID = "7dd2eaa5-7ef2-420a-93dc-0cb337be62ff";
const SUBMISSION_ID = "421c8820-402f-42cb-bb11-bcc835485639";

describe("searchTaskPageSchema", () => {
  it("OPEN과 CLOSED 통합 검색 결과를 파싱한다", () => {
    const page = searchTaskPageSchema.parse({
      items: [
        {
          taskId: TASK_ID,
          title: "대중교통 개선 투표",
          description: null,
          taskStatus: "OPEN",
          openedAt: "2026-10-01T00:00:00Z",
          closesAt: "2026-10-15T00:00:00Z",
          closedAt: null,
          closureType: null,
          mySubmission: null,
          resultAvailable: false,
        },
        {
          taskId: "9b089650-8b20-45ec-8392-88725dd1d60a",
          title: "주차 정책 투표",
          description: "주차 문제 해결 방안을 선택해 주세요.",
          taskStatus: "CLOSED",
          openedAt: "2026-09-01T00:00:00Z",
          closesAt: "2026-09-15T00:00:00Z",
          closedAt: "2026-09-15T00:00:00Z",
          closureType: "DEADLINE_REACHED",
          mySubmission: {
            submissionId: SUBMISSION_ID,
            submittedAt: "2026-09-05T03:00:00Z",
          },
          resultAvailable: true,
        },
      ],
      nextCursor: "opaque-cursor",
    });

    expect(page.items.map((item) => item.taskStatus)).toEqual(["OPEN", "CLOSED"]);
    expect(page.nextCursor).toBe("opaque-cursor");
  });

  it("CLOSED 결과의 resultAvailable=false를 방어 처리용으로 수용한다", () => {
    expect(
      searchTaskPageSchema.safeParse({
        items: [
          {
            taskId: TASK_ID,
            title: "결과 준비 중 투표",
            description: null,
            taskStatus: "CLOSED",
            openedAt: "2026-09-01T00:00:00Z",
            closesAt: "2026-09-15T00:00:00Z",
            closedAt: "2026-09-15T00:00:00Z",
            closureType: "EARLY_CLOSED",
            mySubmission: {
              submissionId: SUBMISSION_ID,
              submittedAt: "2026-09-05T03:00:00Z",
            },
            resultAvailable: false,
          },
        ],
        nextCursor: null,
      }).success,
    ).toBe(true);
  });
});

describe("searchTaskParamsSchema", () => {
  it("검색어를 trim하고 기본 size를 적용한다", () => {
    expect(searchTaskParamsSchema.parse({ query: "  교통  " })).toEqual({
      query: "교통",
      size: 20,
    });
  });

  it("빈 검색어와 200자를 초과한 검색어를 거절한다", () => {
    expect(searchTaskParamsSchema.safeParse({ query: "   " }).success).toBe(false);
    expect(searchTaskParamsSchema.safeParse({ query: "가".repeat(201) }).success).toBe(false);
  });
});
