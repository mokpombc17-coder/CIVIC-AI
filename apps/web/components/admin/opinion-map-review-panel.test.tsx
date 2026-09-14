import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  OpinionMapReviewPanelView,
  type OpinionMapReviewPanelState,
} from "@/components/admin/opinion-map-review-panel";
import {
  opinionMapGenerationPath,
  readOpinionMapGeneration,
  requestOpinionMapGeneration,
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

describe("Opinion Map 관리자 검수 계약", () => {
  it("AVAILABLE 응답과 영역별 상태를 읽는다", () => {
    expect(readOpinionMapGeneration(availableGeneration())).toEqual(availableGeneration());
  });

  it("NOT_CREATED의 null 버전·응답 수를 읽는다", () => {
    const value = {
      ...availableGeneration(),
      resultVersion: null,
      status: "NOT_CREATED",
      attemptCount: 0,
      processingStartedAt: null,
      completedAt: null,
      canGenerate: true,
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

  it("관리자 프록시로 GET을 no-store로 보내고 과업 ID를 검증한다", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(availableGeneration()));
    await expect(requestOpinionMapGeneration(taskId, request)).resolves.toMatchObject({
      taskId,
      status: "AVAILABLE",
    });
    expect(request).toHaveBeenCalledWith(opinionMapGenerationPath(taskId), {
      cache: "no-store",
    });

    request.mockResolvedValueOnce(Response.json({ ...availableGeneration(), taskId: "다른-과업" }));
    await expect(requestOpinionMapGeneration(taskId, request)).rejects.toThrow(
      "Opinion Map 검수 응답 형식을 확인하지 못했습니다.",
    );
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
      "확정 결과와 저장된 Opinion Map이 일치하지 않습니다. 서버 데이터 점검이 필요합니다. 문의 코드: trace-review-1",
    );
  });
});

describe("Opinion Map 관리자 검수 화면", () => {
  it("선택지별 두 요약과 영역별 대체 문구를 구분한다", () => {
    const html = renderView({
      status: "ready",
      generation: readOpinionMapGeneration(availableGeneration())!,
    });
    expect(html).toContain("같은 선택 의견");
    expect(html).toContain("다른 선택 의견");
    expect(html).toContain("Opinion Map 생성 결과");
    expect(html).toContain("생성 완료");
    expect(html).not.toContain("검수 가능");
    expect(html).toContain("같은 선택을 한 참여자의 이유입니다.");
    expect(html).toContain("이 선택지를 고른 응답이 없습니다.");
    expect(html).toContain("요약할 수 있는 의견이 충분하지 않습니다.");
  });

  it("생성 이력이 없고 생성 가능한 과업에는 생성 버튼을 표시한다", () => {
    const generation = readOpinionMapGeneration({
      ...availableGeneration(),
      resultVersion: null,
      status: "NOT_CREATED",
      attemptCount: 0,
      processingStartedAt: null,
      completedAt: null,
      canGenerate: true,
      options: availableGeneration().options.map((option) => ({
        ...option,
        responseCount: null,
        sameChoice: null,
        otherChoices: null,
      })),
    });
    const html = renderView({ status: "ready", generation: generation! });
    expect(html).toContain("생성 전");
    expect(html).toContain("Opinion Map 생성");
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
      actionPending: false,
      notice: "",
      onGenerate: () => undefined,
      onReload: () => undefined,
    }),
  );
}
