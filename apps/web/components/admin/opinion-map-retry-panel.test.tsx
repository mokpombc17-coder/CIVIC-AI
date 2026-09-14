import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  OpinionMapRetryPanelView,
  type OpinionMapRetryPanelState,
} from "@/components/admin/opinion-map-retry-panel";
import {
  mergeOpinionMapUnavailableItems,
  opinionMapFailureMessage,
  opinionMapRetryPath,
  opinionMapUnavailablePath,
  readOpinionMapUnavailablePage,
  requestOpinionMapRetry,
  requestOpinionMapUnavailablePage,
  type OpinionMapUnavailableItem,
} from "@/lib/admin/opinion-map-generation";

const taskId = "7dd2eaa5-7ef2-420a-93dc-0cb337be62ff";

describe("Opinion Map 관리자 재시도", () => {
  it("UNAVAILABLE 목록 계약과 cursor 경로를 해석한다", async () => {
    const request = vi.fn(async () => Response.json(pageBody()));

    const page = await requestOpinionMapUnavailablePage("next/한글?", request as typeof fetch);

    expect(page).toEqual(readOpinionMapUnavailablePage(pageBody()));
    expect(request).toHaveBeenCalledWith(
      "/api/v1/admin/opinion-map-generations/unavailable?limit=20&cursor=next%2F%ED%95%9C%EA%B8%80%3F",
      { cache: "no-store" },
    );
    expect(opinionMapUnavailablePath()).toBe(
      "/api/v1/admin/opinion-map-generations/unavailable?limit=20",
    );
  });

  it("필수 필드가 잘못된 목록 응답을 거부한다", () => {
    expect(readOpinionMapUnavailablePage({ ...pageBody(), items: [{ taskId }] })).toBeNull();
    expect(readOpinionMapUnavailablePage({ items: [], nextCursor: 1 })).toBeNull();
  });

  it("본문 없이 재시도하고 200·202의 정상 action을 해석한다", async () => {
    for (const [status, action] of [
      [202, "RETRIED"],
      [200, "UNCHANGED"],
    ] as const) {
      const calls: Parameters<typeof fetch>[] = [];
      const request = vi.fn(async (...args: Parameters<typeof fetch>) => {
        calls.push(args);
        return Response.json(retryBody(action), { status });
      });

      await expect(requestOpinionMapRetry(taskId, request as typeof fetch)).resolves.toMatchObject({
        taskId,
        action,
      });
      expect(request).toHaveBeenCalledWith(opinionMapRetryPath(taskId), { method: "POST" });
      expect(calls[0]?.[1]).not.toHaveProperty("body");
    }
  });

  it("재시도 오류의 공통 Problem Details를 사용자 문구로 변환한다", async () => {
    const request = vi.fn(async () =>
      Response.json(
        { code: "OPINION_MAP_GENERATION_DISABLED", detail: "Disabled", status: 503 },
        { status: 503 },
      ),
    );

    await expect(requestOpinionMapRetry(taskId, request as typeof fetch)).rejects.toThrow(
      "Opinion Map 생성 기능이 비활성화되어 있습니다.",
    );
  });

  it("실패 목록에는 항목별 재시도 상태와 더 보기를 표시한다", () => {
    const items = [unavailableItem(), unavailableItem({ taskId: "task-2", canRetry: false })];
    const html = renderView({ status: "ready", items, nextCursor: "next" }, new Set([taskId]));

    expect(html).toContain("Opinion Map 생성 실패");
    expect(html).toContain("2건+");
    expect(html).toContain("AI 응답 시간이 초과되었습니다.");
    expect(html).toContain("재시도 중");
    expect(html).toContain("재시도 불가");
    expect(html).toContain("더 보기");
    expect(html.match(/disabled=""/gu)).toHaveLength(2);
  });

  it("빈 목록은 숨기고 조회 실패는 다시 불러올 수 있게 표시한다", () => {
    expect(renderView({ status: "ready", items: [], nextCursor: null })).toBe("");
    const html = renderView({ status: "unavailable", message: "네트워크 오류" });
    expect(html).toContain("실패 목록을 불러오지 못했습니다. 네트워크 오류");
    expect(html).toContain("다시 불러오기");
  });

  it("페이지를 합칠 때 같은 과업은 최신 항목으로 교체한다", () => {
    const current = [unavailableItem()];
    const incoming = [unavailableItem({ attemptCount: 4 }), unavailableItem({ taskId: "task-2" })];

    expect(mergeOpinionMapUnavailableItems(current, incoming)).toEqual(incoming);
    expect(opinionMapFailureMessage("UNKNOWN")).toBe("Opinion Map을 생성하지 못했습니다.");
  });
});

function renderView(
  state: OpinionMapRetryPanelState,
  retryingTaskIds: ReadonlySet<string> = new Set(),
) {
  return renderToStaticMarkup(
    <OpinionMapRetryPanelView
      loadingMore={false}
      notice=""
      onLoadMore={() => undefined}
      onReload={() => undefined}
      onRetry={() => undefined}
      retryingTaskIds={retryingTaskIds}
      state={state}
    />,
  );
}

function unavailableItem(
  overrides: Partial<OpinionMapUnavailableItem> = {},
): OpinionMapUnavailableItem {
  return {
    taskId,
    taskTitle: "우리 동네 생활 개선 과업",
    resultVersion: 1,
    attemptCount: 3,
    lastErrorCode: "OPINION_MAP_OPENROUTER_TIMEOUT",
    failedAt: "2026-09-11T12:00:00Z",
    canRetry: true,
    ...overrides,
  };
}

function pageBody() {
  return { items: [unavailableItem()], nextCursor: "next-cursor" };
}

function retryBody(action: "RETRIED" | "UNCHANGED") {
  return {
    taskId,
    resultVersion: 1,
    status: "PENDING",
    attemptCount: 0,
    action,
    updatedAt: "2026-09-11T12:10:00Z",
  };
}
