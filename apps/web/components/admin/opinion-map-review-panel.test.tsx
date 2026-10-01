import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  OpinionMapReviewPanelView,
  type OpinionMapReviewPanelState,
} from "@/components/admin/opinion-map-review-panel";
import {
  OPINION_MAP_RUN_POLL_TIMEOUT_MS,
  hasOpinionMapRunPollingTimedOut,
  opinionMapGenerationPath,
  opinionMapRegenerationPath,
  opinionMapRunsPath,
  readOpinionMapGeneration,
  readOpinionMapGenerationRuns,
  requestOpinionMapGeneration,
  requestOpinionMapGenerationRuns,
  requestOpinionMapRegeneration,
  type OpinionMapGenerationRun,
} from "@/lib/admin/opinion-map-generation";

const taskId = "7dd2eaa5-7ef2-420a-93dc-0cb337be62ff";

function availableGeneration() {
  return {
    taskId,
    resultVersion: 1,
    status: "AVAILABLE",
    attemptCount: 1,
    lastErrorCode: null,
    nextAttemptAt: null,
    processingStartedAt: "2026-09-14T11:59:00Z",
    completedAt: "2026-09-14T12:00:00Z",
    updatedAt: "2026-09-14T12:00:00Z",
    canGenerate: false,
    canRetry: false,
    canRegenerate: true,
    options: [
      {
        optionId: "e17695c2-afc7-4b14-9b04-95bf87103d0e",
        displayOrder: 1,
        content: "선택지 A",
        responseCount: 12,
        sameChoice: { status: "AVAILABLE", body: "같은 선택을 한 참여자의 이유입니다." },
        otherChoices: { status: "INSUFFICIENT_REASON", body: null },
      },
      {
        optionId: "b419b4cd-2e0f-4ef5-9bda-fafc99409f5f",
        displayOrder: 2,
        content: "선택지 B",
        responseCount: 0,
        sameChoice: { status: "NO_RESPONSES", body: null },
        otherChoices: { status: "AVAILABLE", body: "다른 선택을 한 참여자의 이유입니다." },
      },
    ],
  } as const;
}

function availableRun(overrides: Partial<OpinionMapGenerationRun> = {}): OpinionMapGenerationRun {
  return {
    runId: "90bc4447-2586-48e4-a3d1-58ae23990d24",
    resultVersion: 1,
    runNumber: 2,
    trigger: "ADMIN_REGENERATE",
    status: "AVAILABLE",
    attemptCount: 1,
    requestedBy: "admin-user-id",
    requestedAt: "2026-09-29T01:10:00Z",
    completedAt: "2026-09-29T01:10:02Z",
    lastErrorCode: null,
    attempts: [
      {
        attemptId: "f97440cf-92ad-49a2-8623-f46445bb518f",
        attemptNumber: 1,
        status: "SUCCEEDED",
        provider: "openrouter",
        requestedModel: "openai/gpt-5.6-luna",
        responseModel: "openai/gpt-5.6-luna-20260901",
        providerGenerationId: "gen-123",
        providerRequestId: "req-123",
        promptTokens: 120,
        completionTokens: 45,
        totalTokens: 165,
        cachedTokens: 0,
        reasoningTokens: 12,
        cost: 0.000315,
        currency: "USD",
        finishReason: "stop",
        httpStatus: 200,
        errorCode: null,
        retryable: null,
        startedAt: "2026-09-29T01:10:00Z",
        completedAt: "2026-09-29T01:10:02Z",
        latencyMs: 2_000,
      },
    ],
    ...overrides,
  } as OpinionMapGenerationRun;
}

describe("Opinion Map 관리자 검수 계약", () => {
  it("AVAILABLE 응답과 영역별 상태를 읽는다", () => {
    expect(readOpinionMapGeneration(availableGeneration())).toEqual(availableGeneration());
  });

  it("updatedAt이 null인 응답을 읽는다", () => {
    expect(readOpinionMapGeneration({ ...availableGeneration(), updatedAt: null })).toMatchObject({
      updatedAt: null,
      status: "AVAILABLE",
    });
  });

  it("manifest가 없는 NOT_CREATED의 null 버전·응답 수를 읽는다", () => {
    const value = {
      ...availableGeneration(),
      resultVersion: null,
      status: "NOT_CREATED",
      attemptCount: 0,
      processingStartedAt: null,
      completedAt: null,
      canGenerate: true,
      canRegenerate: false,
      options: availableGeneration().options.map((option) => ({
        ...option,
        responseCount: null,
        sameChoice: null,
        otherChoices: null,
      })),
    };
    expect(readOpinionMapGeneration(value)).toMatchObject({
      status: "NOT_CREATED",
      resultVersion: null,
      canGenerate: true,
    });
  });

  it("manifest가 있는 NOT_CREATED의 버전·응답 수를 읽는다", () => {
    const value = {
      ...availableGeneration(),
      status: "NOT_CREATED",
      attemptCount: 0,
      processingStartedAt: null,
      completedAt: null,
      updatedAt: null,
      canGenerate: true,
      canRegenerate: false,
      options: availableGeneration().options.map((option) => ({
        ...option,
        sameChoice: null,
        otherChoices: null,
      })),
    };
    expect(readOpinionMapGeneration(value)).toMatchObject({
      status: "NOT_CREATED",
      resultVersion: 1,
      updatedAt: null,
      options: [{ responseCount: 12 }, { responseCount: 0 }],
    });
  });

  it("NOT_CREATED의 manifest와 응답 수가 서로 다른 형태를 거부한다", () => {
    const options = availableGeneration().options.map((option) => ({
      ...option,
      sameChoice: null,
      otherChoices: null,
    }));
    expect(
      readOpinionMapGeneration({
        ...availableGeneration(),
        status: "NOT_CREATED",
        resultVersion: null,
        options,
      }),
    ).toBeNull();
    expect(
      readOpinionMapGeneration({
        ...availableGeneration(),
        status: "NOT_CREATED",
        options: options.map((option, index) => ({
          ...option,
          responseCount: index === 0 ? null : option.responseCount,
        })),
      }),
    ).toBeNull();
  });

  it("비 AVAILABLE 상태의 요약 본문과 잘못된 영역 본문을 거부한다", () => {
    expect(readOpinionMapGeneration({ ...availableGeneration(), status: "PROCESSING" })).toBeNull();
    expect(
      readOpinionMapGeneration({
        ...availableGeneration(),
        options: [
          {
            ...availableGeneration().options[0],
            sameChoice: { status: "NO_RESPONSES", body: "본문이 있으면 안 됩니다." },
          },
        ],
      }),
    ).toBeNull();
  });

  it("관리자 프록시로 GET을 no-store로 보내고 투표 ID를 검증한다", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(availableGeneration()));
    await expect(requestOpinionMapGeneration(taskId, request)).resolves.toMatchObject({
      taskId,
      status: "AVAILABLE",
    });
    expect(request).toHaveBeenCalledWith(opinionMapGenerationPath(taskId), {
      cache: "no-store",
    });

    request.mockResolvedValueOnce(Response.json({ ...availableGeneration(), taskId: "다른-투표" }));
    await expect(requestOpinionMapGeneration(taskId, request)).rejects.toThrow(
      "정성 요약 조회 응답 형식을 확인하지 못했습니다.",
    );
  });

  it("run과 attempt의 상태별 nullable 계약을 검증한다", () => {
    const completed = availableRun();
    const taskClosed = {
      ...availableRun({
        runId: "14b43da0-1b44-48d9-8aed-f5e59103919e",
        runNumber: 1,
      }),
      trigger: "TASK_CLOSED",
      requestedBy: null,
    } as const;
    expect(readOpinionMapGenerationRuns({ runs: [completed, taskClosed] })).toEqual({
      runs: [completed, taskClosed],
    });

    expect(
      readOpinionMapGenerationRuns({
        runs: [{ ...completed, trigger: "TASK_CLOSED", requestedBy: "admin-user-id" }],
      }),
    ).toBeNull();
    expect(
      readOpinionMapGenerationRuns({ runs: [{ ...completed, status: "PROCESSING" }] }),
    ).toBeNull();
    expect(
      readOpinionMapGenerationRuns({
        runs: [
          {
            ...completed,
            attempts: [{ ...completed.attempts[0], cost: null, currency: "USD" }],
          },
        ],
      }),
    ).toBeNull();
  });

  it("진행 중 run과 STARTED attempt를 읽는다", () => {
    const completed = availableRun();
    const active = {
      ...completed,
      status: "PROCESSING",
      completedAt: null,
      attempts: [
        {
          ...completed.attempts[0],
          status: "STARTED",
          responseModel: null,
          providerGenerationId: null,
          providerRequestId: null,
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          cachedTokens: null,
          reasoningTokens: null,
          cost: null,
          currency: null,
          finishReason: null,
          httpStatus: null,
          completedAt: null,
          latencyMs: null,
        },
      ],
    };
    expect(readOpinionMapGenerationRuns({ runs: [active] })).toMatchObject({
      runs: [{ status: "PROCESSING", completedAt: null, attempts: [{ status: "STARTED" }] }],
    });
  });

  it("run 이력과 재생성 요청을 관리자 프록시로 전송한다", async () => {
    const run = availableRun();
    const runsRequest = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ runs: [run] }));
    await expect(requestOpinionMapGenerationRuns(taskId, runsRequest)).resolves.toEqual({
      runs: [run],
    });
    expect(runsRequest).toHaveBeenCalledWith(opinionMapRunsPath(taskId), { cache: "no-store" });

    const regeneration = {
      taskId,
      resultVersion: 1,
      runId: run.runId,
      runNumber: 2,
      status: "PENDING",
      attemptCount: 0,
      created: true,
      requestedAt: "2026-09-29T01:10:00Z",
      updatedAt: "2026-09-29T01:10:00Z",
    } as const;
    const regenerationRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(regeneration, { status: 202 }));
    await expect(
      requestOpinionMapRegeneration(taskId, "idempotency-key", regenerationRequest),
    ).resolves.toEqual(regeneration);
    expect(regenerationRequest).toHaveBeenCalledWith(opinionMapRegenerationPath(taskId), {
      method: "POST",
      headers: { "Idempotency-Key": "idempotency-key" },
    });
    expect(regenerationRequest.mock.calls[0]?.[1]).not.toHaveProperty("body");

    regenerationRequest.mockResolvedValueOnce(
      Response.json({ ...regeneration, created: false }, { status: 200 }),
    );
    await expect(
      requestOpinionMapRegeneration(taskId, "same-idempotency-key", regenerationRequest),
    ).resolves.toMatchObject({ created: false, runId: run.runId });
  });

  it("요청 시각부터 10분 뒤 폴링을 중단한다", () => {
    const requestedAt = "2026-09-29T01:10:00Z";
    expect(
      hasOpinionMapRunPollingTimedOut(
        { requestedAt },
        Date.parse(requestedAt) + OPINION_MAP_RUN_POLL_TIMEOUT_MS - 1,
      ),
    ).toBe(false);
    expect(
      hasOpinionMapRunPollingTimedOut(
        { requestedAt },
        Date.parse(requestedAt) + OPINION_MAP_RUN_POLL_TIMEOUT_MS,
      ),
    ).toBe(true);
  });

  it("무결성 오류를 운영자가 조치할 수 있는 문구로 표시한다", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { code: "TASK_RESULT_VIEW_INTEGRITY_FAILURE", traceId: "trace-review-1" },
          { status: 500 },
        ),
      );
    await expect(requestOpinionMapGeneration(taskId, request)).rejects.toThrow(
      "확정 결과와 저장된 정성 요약이 일치하지 않습니다. 서버 데이터 점검이 필요합니다. 문의 코드: trace-review-1",
    );
  });
});

describe("Opinion Map 관리자 검수 화면", () => {
  it("선택지별 두 요약과 영역별 대체 문구를 구분한다", () => {
    const html = renderView(
      readyState(readOpinionMapGeneration(availableGeneration())!, [availableRun()]),
    );
    expect(html).toContain("같은 선택 의견");
    expect(html).toContain("다른 선택 의견");
    expect(html).toContain("정성 요약");
    expect(html).toContain("생성 완료");
    expect(html).not.toContain("Opinion Map");
    expect(html).not.toContain("검수 가능");
    expect(html).toContain("같은 선택을 한 참여자의 이유입니다.");
    expect(html).toContain("이 선택지를 고른 응답이 없습니다.");
    expect(html).toContain("요약할 수 있는 의견이 충분하지 않습니다.");
    expect(html).not.toContain("12건");
    expect(html).not.toContain("0건");
    expect(html).toContain("정성 요약 재생성");
    expect(html).not.toContain("생성·재시도·과금 이력");
    expect(html).not.toContain("openai/gpt-5.6-luna");
    expect(html).not.toContain("0.000315 USD");
  });

  it("생성 이력이 없고 생성 가능한 투표에는 생성 버튼을 표시한다", () => {
    const generation = readOpinionMapGeneration({
      ...availableGeneration(),
      resultVersion: null,
      status: "NOT_CREATED",
      attemptCount: 0,
      processingStartedAt: null,
      completedAt: null,
      canGenerate: true,
      canRegenerate: false,
      options: availableGeneration().options.map((option) => ({
        ...option,
        responseCount: null,
        sameChoice: null,
        otherChoices: null,
      })),
    });
    const html = renderView(readyState(generation!));
    expect(html).toContain("생성 전");
    expect(html).toContain("정성 요약 생성");
  });

  it("재생성 run이 진행 중이면 기존 결과를 유지하고 재생성 버튼을 비활성화한다", () => {
    const activeRun = readOpinionMapGenerationRuns({
      runs: [
        {
          ...availableRun(),
          status: "PROCESSING",
          completedAt: null,
          attempts: [],
        },
      ],
    })!.runs[0]!;
    const html = renderView(
      readyState(readOpinionMapGeneration(availableGeneration())!, [activeRun]),
    );

    expect(html).toContain("같은 선택을 한 참여자의 이유입니다.");
    expect(html).toContain("재생성 진행 중…");
    expect(html).toContain("disabled");
  });

  it("자동 폴링 제한에 도달하면 지연 안내와 수동 새로고침을 표시한다", () => {
    const html = renderView(
      readyState(readOpinionMapGeneration(availableGeneration())!, [availableRun()], {
        pollingTimedOut: true,
      }),
    );
    expect(html).toContain("처리가 지연되고 있어 자동 상태 확인을 중단했습니다.");
    expect(html).toContain("상태 새로고침");
  });

  it("조회 실패 시 오류와 다시 불러오기 동작을 표시한다", () => {
    const html = renderView({ status: "unavailable", message: "서버 데이터 점검이 필요합니다." });
    expect(html).toContain("서버 데이터 점검이 필요합니다.");
    expect(html).toContain("다시 불러오기");
  });
});

function renderView(state: OpinionMapReviewPanelState): string {
  return renderToStaticMarkup(
    createElement(OpinionMapReviewPanelView, {
      state,
      action: null,
      notice: "",
      onGenerate: () => undefined,
      onRegenerate: () => undefined,
      onReload: () => undefined,
    }),
  );
}

function readyState(
  generation: NonNullable<ReturnType<typeof readOpinionMapGeneration>>,
  runs: readonly OpinionMapGenerationRun[] = [],
  overrides: Partial<Extract<OpinionMapReviewPanelState, { status: "ready" }>> = {},
): OpinionMapReviewPanelState {
  return {
    status: "ready",
    generation,
    runs,
    historyError: "",
    pollingTimedOut: false,
    ...overrides,
  };
}
