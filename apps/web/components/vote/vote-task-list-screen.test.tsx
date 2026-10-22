import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VoteApiError } from "@/lib/vote/vote-fetch";
import { VoteTaskListScreen } from "./vote-task-list-screen";

const useOpenTasksQueryMock = vi.hoisted(() => vi.fn());
const useCompletedTasksQueryMock = vi.hoisted(() => vi.fn());
const useTaskSearchQueryMock = vi.hoisted(() => vi.fn());
const resetQueriesMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ resetQueries: resetQueriesMock }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/vote",
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("@/lib/vote/vote-queries", () => ({
  flattenCompletedTaskPages: (pages: readonly { items: readonly unknown[] }[] | undefined) =>
    pages?.flatMap((page) => page.items) ?? [],
  useCompletedTasksQuery: useCompletedTasksQueryMock,
  useOpenTasksQuery: useOpenTasksQueryMock,
  useTaskSearchQuery: useTaskSearchQueryMock,
  voteCompletedApiAvailable: false,
  voteQueryKeys: {
    taskSearch: (query: string) => ["vote", "tasks", "search", query],
  },
}));

describe("VoteTaskListScreen", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    resetQueriesMock.mockReset();
    useOpenTasksQueryMock.mockReturnValue(createQueryState());
    useCompletedTasksQueryMock.mockReturnValue(createQueryState());
    useTaskSearchQueryMock.mockReturnValue(createQueryState({ data: { pages: [] } }));
  });

  it("URL에서 복원한 완료 탭을 초기 선택으로 표시한다", () => {
    const html = renderToStaticMarkup(<VoteTaskListScreen initialTab="completed" />);

    expect(html).toContain('aria-selected="false"');
    expect(html).toContain('aria-selected="true"');
    expect(useCompletedTasksQueryMock).toHaveBeenCalledWith(20, true);
  });

  it("검색을 투표 주제 기준의 사용자 문구로 안내한다", () => {
    const html = renderToStaticMarkup(<VoteTaskListScreen />);

    expect(html).toContain(">주제 검색</label>");
    expect(html).toContain('placeholder="주제를 검색해 보세요"');
    expect(html).toContain("진행 중인 투표가 없어요");
    expect(html).toContain('aria-label="홈으로"');
    expect(html).toContain('data-navigation-mode="document"');
    expect(html).toContain('data-state="enabled"');
    expect(html).toContain('href="/home"');
    expect(html).not.toContain('data-state="disabled"');
    expect(html).not.toContain("과업 검색");
    expect(html).not.toContain('placeholder="과업을 검색해 주세요."');
    expect(html).not.toContain("진행 중인 과업이 없습니다.");
  });

  it("검색어가 있으면 진행 중과 완료 투표를 통합 검색 결과로 표시한다", () => {
    useTaskSearchQueryMock.mockReturnValue(
      createQueryState({
        data: {
          pages: [
            {
              items: [
                {
                  closedAt: null,
                  closesAt: "2026-10-15T00:00:00Z",
                  closureType: null,
                  description: "교통 개선 방향",
                  mySubmission: null,
                  openedAt: "2026-10-01T00:00:00Z",
                  resultAvailable: false,
                  taskId: "7dd2eaa5-7ef2-420a-93dc-0cb337be62ff",
                  taskStatus: "OPEN",
                  title: "대중교통 개선 투표",
                },
                {
                  closedAt: "2026-09-15T00:00:00Z",
                  closesAt: "2026-09-15T00:00:00Z",
                  closureType: "DEADLINE_REACHED",
                  description: "주차 문제 해결 방안",
                  mySubmission: {
                    submissionId: "421c8820-402f-42cb-bb11-bcc835485639",
                    submittedAt: "2026-09-05T03:00:00Z",
                  },
                  openedAt: "2026-09-01T00:00:00Z",
                  resultAvailable: true,
                  taskId: "9b089650-8b20-45ec-8392-88725dd1d60a",
                  taskStatus: "CLOSED",
                  title: "주차 정책 투표",
                },
              ],
              nextCursor: null,
            },
          ],
        },
        isSuccess: true,
      }),
    );

    const html = renderToStaticMarkup(
      <VoteTaskListScreen initialQuery="교통" initialTab="completed" />,
    );

    expect(useOpenTasksQueryMock).toHaveBeenCalledWith(false);
    expect(useCompletedTasksQueryMock).toHaveBeenCalledWith(20, false);
    expect(useTaskSearchQueryMock).toHaveBeenCalledWith("교통", 20, true);
    expect(html).toContain('value="교통"');
    expect(html).toContain(">검색 결과</button>");
    expect(html).toContain("대중교통 개선 투표");
    expect(html).toContain("주차 정책 투표");
    expect(html).toContain(">참여하기</span>");
    expect(html).toContain(">결과보기</span>");
  });

  it("검색 결과가 없으면 검색 전용 빈 상태를 표시한다", () => {
    useTaskSearchQueryMock.mockReturnValue(
      createQueryState({ data: { pages: [{ items: [], nextCursor: null }] }, isSuccess: true }),
    );

    const html = renderToStaticMarkup(<VoteTaskListScreen initialQuery="없는 주제" />);

    expect(html).toContain("검색 결과가 없어요");
    expect(html).not.toContain("진행 중인 투표가 없어요");
  });

  it("검색어가 없는 검색 결과 탭은 API를 호출하지 않고 빈 상태를 표시한다", () => {
    const html = renderToStaticMarkup(<VoteTaskListScreen initialView="search" />);

    expect(useTaskSearchQueryMock).toHaveBeenCalledWith("", 20, false);
    expect(useOpenTasksQueryMock).toHaveBeenCalledWith(false);
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("검색 결과가 없어요");
    expect(html).not.toContain('data-vote-task-list-loading="true"');
  });

  it("검색어를 유지한 목록 view에서도 검색 결과 탭을 계속 표시한다", () => {
    useOpenTasksQueryMock.mockReturnValue(
      createQueryState({
        data: [
          {
            closesAt: "2026-10-15T00:00:00Z",
            description: "목록 view 테스트",
            openedAt: "2026-10-01T00:00:00Z",
            submission: { submitted: false, submissionId: null, submittedAt: null },
            taskId: "7dd2eaa5-7ef2-420a-93dc-0cb337be62ff",
            title: "진행 중 목록",
          },
        ],
        isSuccess: true,
      }),
    );

    const html = renderToStaticMarkup(
      <VoteTaskListScreen initialQuery="주민센터" initialTab="active" initialView="list" />,
    );

    expect(useOpenTasksQueryMock).toHaveBeenCalledWith(true);
    expect(useTaskSearchQueryMock).toHaveBeenCalledWith("주민센터", 20, true);
    expect(html).toContain('value="주민센터"');
    expect(html).toContain("진행 중 목록");
    expect(html).toMatch(/aria-selected="false"[^>]*>검색 결과<\/button>/);
  });

  it("결과가 준비되지 않은 완료 검색 항목은 상세 링크를 제공하지 않는다", () => {
    useTaskSearchQueryMock.mockReturnValue(
      createQueryState({
        data: {
          pages: [
            {
              items: [
                {
                  closedAt: "2026-09-15T00:00:00Z",
                  closesAt: "2026-09-15T00:00:00Z",
                  closureType: "EARLY_CLOSED",
                  description: null,
                  mySubmission: {
                    submissionId: "421c8820-402f-42cb-bb11-bcc835485639",
                    submittedAt: "2026-09-05T03:00:00Z",
                  },
                  openedAt: "2026-09-01T00:00:00Z",
                  resultAvailable: false,
                  taskId: "9b089650-8b20-45ec-8392-88725dd1d60a",
                  taskStatus: "CLOSED",
                  title: "결과 집계 중인 투표",
                },
              ],
              nextCursor: null,
            },
          ],
        },
      }),
    );

    const html = renderToStaticMarkup(<VoteTaskListScreen initialQuery="집계" />);

    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("결과 준비 중");
    expect(html).not.toContain('href="/vote/9b089650-8b20-45ec-8392-88725dd1d60a/result"');
  });

  it("초기 목록 조회 중에는 문구 대신 화면 형태를 유지하는 카드를 표시한다", () => {
    useOpenTasksQueryMock.mockReturnValue(createQueryState({ isPending: true }));

    const html = renderToStaticMarkup(<VoteTaskListScreen />);

    expect(html).toContain('data-vote-task-list-loading="true"');
    expect(html.match(/taskSkeletonCard/g)).toHaveLength(3);
    expect(html).not.toContain("과업 목록을 불러오는 중입니다.");
  });

  it("투표 카드 전체를 상세 화면으로 이동하는 링크로 제공한다", () => {
    useOpenTasksQueryMock.mockReturnValue(
      createQueryState({
        data: [
          {
            closesAt: "2026-09-30T09:00:00Z",
            description: "투표 카드 전체 링크 테스트",
            openedAt: "2026-09-01T09:00:00Z",
            submission: { submitted: false, submissionId: null, submittedAt: null },
            taskId: "0f6e8c4f-87d0-4f6e-87b7-c3635c3c96b7",
            title: "지역 교통 정책",
          },
        ],
      }),
    );

    const html = renderToStaticMarkup(<VoteTaskListScreen />);

    expect(html).toMatch(
      /aria-label="지역 교통 정책 참여하기" class="[^"]*taskCardLink[^"]*select-none[^"]*\[-webkit-touch-callout:none\][^"]*" draggable="false" href="\/vote\/0f6e8c4f-87d0-4f6e-87b7-c3635c3c96b7"/,
    );
    expect(html).toMatch(
      /<div class="[^"]*taskCardSurface[^"]*"><div class="[^"]*taskCardCopy[^"]*">/,
    );
    expect(html).toMatch(/<span aria-hidden="true" class="[^"]*taskAction[^"]*">참여하기<\/span>/);
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
    expect(html).toContain('data-navigation-mode="document"');
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
    isSuccess: boolean;
    failureCount: number;
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
    isSuccess: false,
    failureCount: 0,
    refetch: vi.fn(),
    ...patch,
  };
}
