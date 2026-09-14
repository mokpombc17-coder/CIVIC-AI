import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import VoteTaskResultPage from "./page";

vi.mock("@/components/vote/vote-task-result-screen", () => ({
  VoteTaskResultScreen: ({
    mockOpinionMapStatus,
    source,
  }: {
    mockOpinionMapStatus: string;
    source: string;
  }) => <div data-opinion-map-status={mockOpinionMapStatus} data-source={source} />,
}));

const TASK_ID = "727c24f5-7c05-4730-912c-5bb6327c6590";

describe("VoteTaskResultPage", () => {
  it("로컬 디자인 샘플에서 참여자 의견 요약 준비 중 상태를 전달한다", async () => {
    const page = await VoteTaskResultPage({
      params: Promise.resolve({ taskId: TASK_ID }),
      searchParams: Promise.resolve({ opinionMap: "pending", source: "mock" }),
    });

    expect(renderToStaticMarkup(page)).toContain('data-opinion-map-status="PENDING"');
  });

  it("별도 요청이 없으면 준비 완료 상태를 전달한다", async () => {
    const page = await VoteTaskResultPage({
      params: Promise.resolve({ taskId: TASK_ID }),
      searchParams: Promise.resolve({ source: "mock" }),
    });

    expect(renderToStaticMarkup(page)).toContain('data-opinion-map-status="AVAILABLE"');
  });
});
