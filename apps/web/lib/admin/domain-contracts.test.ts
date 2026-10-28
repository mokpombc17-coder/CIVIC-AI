import { describe, expect, it } from "vitest";
import {
  canReadTaskResult,
  adminFieldError,
  formatAdminProblem,
  formatSimulationProblem,
  readRoomCreationRequestPage,
  readTaskDetail,
  readTaskPreparationStartResponse,
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

  it("parses task preparation and capabilities with lifecycle history", () => {
    const task = taskResponse();
    const detail = readTaskDetail({
      task,
      preparation: {
        requestId: "5aaf64a5-d6c9-4fd0-aa6d-371c22c90a58",
        status: "PROCESSING",
        contentFingerprint:
          "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        attemptCount: 1,
        processingStartedAt: "2026-09-03T03:00:00Z",
        preparedAt: null,
        lastError: null,
        updatedAt: "2026-09-03T03:00:00Z",
      },
      capabilities: {
        canEditContent: false,
        canStartPreparation: false,
        canSchedule: false,
        canOpenNow: false,
      },
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
    });

    expect(detail?.preparation?.status).toBe("PROCESSING");
    expect(detail?.capabilities).toEqual({
      canEditContent: false,
      canStartPreparation: false,
      canSchedule: false,
      canOpenNow: false,
    });
    expect(detail?.lifecycleHistory).toHaveLength(1);
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

  it("rejects state-inconsistent task preparation responses", () => {
    const base = {
      requestId: "5aaf64a5-d6c9-4fd0-aa6d-371c22c90a58",
      contentFingerprint: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      attemptCount: 1,
      processingStartedAt: null,
      updatedAt: "2026-09-03T03:00:00Z",
    };
    const response = (preparation: Record<string, unknown>) =>
      readTaskPreparationStartResponse({
        taskId: "7e85d865-4616-4cf5-967c-7d23c27dbf4c",
        preparation,
        replayed: false,
      });

    expect(response({ ...base, status: "READY", preparedAt: null, lastError: null })).toBeNull();
    expect(response({ ...base, status: "FAILED", preparedAt: null, lastError: null })).toBeNull();
    expect(
      response({
        ...base,
        status: "REJECTED",
        preparedAt: null,
        lastError: { code: "REJECTED", detail: "Rejected", retryable: true },
      }),
    ).toBeNull();
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

  it("시뮬레이션 서버의 영어 오류는 상태별 한국어로 바꾸고 문의 코드는 유지한다", () => {
    expect(
      formatSimulationProblem({
        code: "SIMULATION_SCENARIO_INVALID",
        detail: "scenario name is required",
        status: 422,
        traceId: "trace-2",
        violations: [],
      }),
    ).toBe("입력한 내용을 다시 확인해 주세요. 문의 코드: trace-2");
    expect(
      formatSimulationProblem({
        code: "HTTP_503",
        status: 503,
        violations: [],
      }),
    ).toBe("서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도해 주세요.");
    expect(
      formatSimulationProblem({
        code: "SIMULATION_BUDGET",
        detail: "잔액이 부족합니다.",
        status: 409,
        violations: [],
      }),
    ).toBe("잔액이 부족합니다.");
  });

  it("시뮬레이션 거절 사유를 공통 충돌 문구 대신 구체적으로 보여 준다", () => {
    expect(
      formatSimulationProblem({
        code: "SIMULATION_ACTIVE_RUN_EXISTS",
        detail: "The administrator already has an active simulation.",
        status: 409,
        violations: [],
      }),
    ).toBe(
      "현재 진행 중인 시뮬레이션이 있어 지금은 실행할 수 없습니다. 진행 중인 작업이 끝난 뒤 다시 실행해 주세요.",
    );
    expect(
      formatSimulationProblem({
        code: "INSUFFICIENT_BALANCE",
        detail: "The shared simulation wallet has insufficient available balance.",
        status: 409,
        traceId: "trace-3",
        violations: [],
      }),
    ).toBe("시뮬레이션 잔액이 부족해 실행할 수 없습니다. 잔액을 확인해 주세요. 문의 코드: trace-3");
    expect(
      formatSimulationProblem({
        code: "STALE_BILLING_PREVIEW",
        detail: "Pricing changed. Request a new preview before starting.",
        status: 409,
        violations: [],
      }),
    ).not.toContain("다른 변경과 충돌했습니다");
    expect(formatSimulationProblem({ code: "UNKNOWN_CONFLICT", status: 409, violations: [] })).toBe(
      "다른 변경과 충돌했습니다. 최신 상태를 확인한 뒤 다시 시도해 주세요.",
    );
  });

  it("투표·토론방 오류는 서버 원문 처리를 바꾸지 않는다", () => {
    expect(
      formatAdminProblem({
        code: "TASK_LOCKED",
        detail: "Task is locked",
        status: 409,
        violations: [],
      }),
    ).toBe("Task is locked");
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

  it("AI 답변 준비 장애를 관리자에게 복구 가능한 문구로 안내한다", () => {
    expect(
      formatAdminProblem({
        code: "TASK_PREPARATION_UNAVAILABLE",
        detail: "The runtime is unavailable.",
        status: 503,
        violations: [],
      }),
    ).toBe("AI 답변 준비를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  });

  it.each([
    ["TASK_RESULT_NOT_FINALIZED", "투표 결과가 아직 확정되지 않아 정성 요약을 생성할 수 없습니다."],
    ["OPINION_MAP_NOT_CREATED", "재생성할 기존 정성 요약이 없습니다."],
    ["OPINION_MAP_NOT_AVAILABLE", "성공한 정성 요약만 재생성할 수 있습니다."],
  ] as const)("Opinion Map 재생성 오류 %s를 운영자 문구로 안내한다", (code, expected) => {
    expect(formatAdminProblem({ code, status: 409, violations: [] })).toBe(expected);
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
