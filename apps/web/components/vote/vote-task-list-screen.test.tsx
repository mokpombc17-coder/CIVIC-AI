import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VoteApiError } from "@/lib/vote/vote-fetch";
import { VoteTaskListScreen } from "./vote-task-list-screen";

const useOpenTasksQueryMock = vi.hoisted(() => vi.fn());
const useCompletedTasksQueryMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => "/vote",
}));

vi.mock("@/lib/vote/vote-queries", () => ({
  flattenCompletedTaskPages: () => [],
  useCompletedTasksQuery: useCompletedTasksQueryMock,
  useOpenTasksQuery: useOpenTasksQueryMock,
}));

describe("VoteTaskListScreen", () => {
  beforeEach(() => {
    useOpenTasksQueryMock.mockReturnValue(createQueryState());
    useCompletedTasksQueryMock.mockReturnValue(createQueryState());
  });

  it("검색을 투표 주제 기준의 사용자 문구로 안내한다", () => {
    const html = renderToStaticMarkup(<VoteTaskListScreen />);

    expect(html).toContain(">주제 검색</label>");
    expect(html).toContain('placeholder="투표 주제를 검색해 주세요."');
    expect(html).toContain("진행 중인 투표가 없습니다.");
    expect(html).toContain('aria-label="뒤로 가기"');
    expect(html).toContain('data-state="disabled" disabled=""');
    expect(html).not.toContain("과업 검색");
    expect(html).not.toContain('placeholder="과업을 검색해 주세요."');
    expect(html).not.toContain("진행 중인 과업이 없습니다.");
  });

  it("401 목록 오류는 다시 시도 대신 로그인 action을 제공한다", () => {
    useOpenTasksQueryMock.mockReturnValue(
      createQueryState({
        error: new VoteApiError(401, "Unauthorized", "http://localhost:8084/api/v1/tasks", {
          detail: "Authentication is required.",
        }),
        isError: true,
      }),
    );

    const html = renderToStaticMarkup(<VoteTaskListScreen />);

    expect(html).toContain("로그인 후 과업 목록을 확인할 수 있습니다.");
    expect(html).toContain('href="/login?returnTo=%2Fvote"');
    expect(html).toContain(">로그인하기</a>");
    expect(html).not.toContain(">다시 시도</button>");
  });

  it("비인증 목록 오류는 기존 다시 시도를 유지한다", () => {
    useOpenTasksQueryMock.mockReturnValue(
      createQueryState({ error: new Error("network error"), isError: true }),
    );

    const html = renderToStaticMarkup(<VoteTaskListScreen />);

    expect(html).toContain("과업 목록을 불러오지 못했습니다.");
    expect(html).toContain(">다시 시도</button>");
    expect(html).not.toContain(">로그인하기</a>");
  });
});

function createQueryState(
  patch: Partial<{
    data: unknown;
    error: unknown;
    hasNextPage: boolean;
    isError: boolean;
    isFetchingNextPage: boolean;
    isPending: boolean;
  }> = {},
) {
  return {
    data: [],
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isError: false,
    isFetchingNextPage: false,
    isPending: false,
    refetch: vi.fn(),
    ...patch,
  };
}
