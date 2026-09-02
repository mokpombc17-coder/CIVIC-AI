import { describe, expect, it } from "vitest";
import {
  canReadTaskResult,
  adminFieldError,
  formatAdminProblem,
  readRoomCreationRequestPage,
  readTaskDetail,
  readTaskResultSummary,
  validateRejectionReason,
} from "./domain-contracts";

describe("admin domain response contracts", () => {
  it("accepts the current Chat categoryIds and room version response contract", () => {
    const page = readRoomCreationRequestPage({
      items: [
        {
          creationRequestId: "opaque-request-id",
          requesterUserId: "user-id",
          name: "시민 토론방",
          description: "",
          categoryIds: [],
          visibility: "LISTED",
          joinPolicy: "OPEN",
          status: "PENDING",
          requestedAt: "2026-08-26T03:00:00Z",
          resolvedAt: null,
          roomId: null,
          ownerMembershipId: null,
          roomVersion: null,
          ownerMembershipVersion: null,
          rejectionReason: null,
          replayed: false,
        },
      ],
      nextCursor: null,
      hasNext: false,
    });
    expect(page?.items[0]?.creationRequestId).toBe("opaque-request-id");
    expect(page?.items[0]?.categoryIds).toEqual([]);
    expect(page?.items[0]?.roomVersion).toBeNull();
  });

  it("validates rejection reasons by Unicode code points and one-line text", () => {
    expect(validateRejectionReason("정당한 반려 사유")).toBeNull();
    expect(validateRejectionReason("첫 줄\n둘째 줄")).toContain("한 줄");
    expect(validateRejectionReason("😀".repeat(101))).toContain("1~100자");
  });

  it("maps nested server violations back to their input field", () => {
    expect(
      adminFieldError(
        {
          code: "VALIDATION_FAILED",
          status: 422,
          violations: [{ field: "request.question.content", message: "질문을 입력해 주세요." }],
        },
        "question.content",
      ),
    ).toBe("질문을 입력해 주세요.");
  });

  it("parses task detail while keeping lifecycle history", () => {
    const task = taskResponse();
    expect(
      readTaskDetail({
        task,
        lifecycleHistory: [
          {
            id: "event-1",
            eventType: "TASK_CREATED",
            previousStatus: null,
            newStatus: "DRAFT",
            previousSchedule: null,
            newSchedule: null,
            trigger: "ADMIN",
            actorId: "admin-id",
            reason: null,
            closureType: null,
            occurredAt: "2026-08-26T02:00:00Z",
          },
        ],
      })?.lifecycleHistory,
    ).toHaveLength(1);
  });

  it("rejects inconsistent result totals and enables only completed results", () => {
    expect(
      readTaskResultSummary({
        schemaVersion: "task-result-summary/v1",
        resultVersion: 1,
        responseCount: 3,
        options: [
          { key: "a", content: "A안", count: 1 },
          { key: "b", content: "B안", count: 1 },
        ],
      }),
    ).toBeNull();
    expect(canReadTaskResult({ status: "CLOSED", closureType: "EARLY_CLOSED" })).toBe(true);
    expect(canReadTaskResult({ status: "CLOSED", closureType: "CANCELLED" })).toBe(false);
  });

  it("진행 중인 시뮬레이션에는 결과가 아직 없다는 빈 상태만 표시한다", () => {
    expect(
      formatAdminProblem({
        code: "SIMULATION_NOT_COMPLETED",
        detail: "Results are available only after successful completion.",
        status: 409,
        traceId: "f1f7d98b-467f-4df4-9050-0f1e896a0216",
        violations: [],
      }),
    ).toBe("아직 결과가 없습니다.");
  });

  it("조치가 필요한 오류에는 기존 문의 코드를 유지한다", () => {
    expect(
      formatAdminProblem({
        code: "UNEXPECTED_ERROR",
        detail: "요청을 처리하지 못했습니다.",
        status: 500,
        traceId: "trace-1",
        violations: [],
      }),
    ).toBe("요청을 처리하지 못했습니다. 문의 코드: trace-1");
  });
});

function taskResponse() {
  return {
    id: "7e85d865-4616-4cf5-967c-7d23c27dbf4c",
    title: "정책 선호도 조사",
    description: "관리자 설명",
    question: {
      id: "0fb30319-91b2-419a-9bcb-90951bb4f3e9",
      content: "어떤 안을 선호하시나요?",
      description: null,
      options: [
        {
          id: "4928e1be-b4ef-45c6-bf83-17641cf4183d",
          displayOrder: 1,
          content: "A안",
        },
        {
          id: "879ba3de-0b84-412b-b51f-e879e9d8f6e2",
          displayOrder: 2,
          content: "B안",
        },
      ],
    },
    status: "DRAFT",
    schedule: null,
    publishedAt: null,
    openedAt: null,
    closedAt: null,
    closureType: null,
    createdAt: "2026-08-26T02:00:00Z",
    updatedAt: "2026-08-26T02:00:00Z",
  };
}
