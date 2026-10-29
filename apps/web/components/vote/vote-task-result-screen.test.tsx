import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OpinionMapResponse } from "@/lib/vote/vote-completed-contracts";
import { taskResultFixtures } from "@/lib/vote/vote-completed-api";
import { VoteApiError } from "@/lib/vote/vote-fetch";
import { votePublishingResult } from "@/lib/vote/vote-publishing-fixtures";
import { VoteTaskResultScreen } from "./vote-task-result-screen";

const useTaskResultQueryMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => "/vote/task-01/result",
}));

vi.mock("@/lib/vote/vote-queries", () => ({
  useTaskResultQuery: useTaskResultQueryMock,
  voteCompletedApiAvailable: true,
}));

const apiResultFixture = Object.values(taskResultFixtures)[0]!;

function renderApiOpinionMap(opinionMap: OpinionMapResponse): string {
  useTaskResultQueryMock.mockReturnValue({
    data: { ...apiResultFixture, opinionMap },
    error: null,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  });

  return renderToStaticMarkup(<VoteTaskResultScreen taskId={apiResultFixture.taskId} />);
}

describe("VoteTaskResultScreen", () => {
  it("로그인이 만료되면 다시 시도 대신 이 결과로 돌아오는 로그인 링크를 표시한다", () => {
    useTaskResultQueryMock.mockReturnValue({
      data: undefined,
      error: new VoteApiError(401, "Unauthorized", "/tasks/task-01/result", null),
      isError: true,
      isPending: false,
      refetch: vi.fn(),
    });

    const html = renderToStaticMarkup(<VoteTaskResultScreen taskId="task-01" />);

    expect(html).toContain("로그인 후 투표 결과를 확인할 수 있습니다.");
    expect(html).toContain('href="/login?returnTo=%2Fvote%2Ftask-01%2Fresult"');
    expect(html).not.toContain(">다시 시도</button>");
  });

  it("결과 화면에서 투표 대상을 주제로 안내한다", () => {
    const html = renderToStaticMarkup(<VoteTaskResultScreen source="mock" taskId="task-01" />);

    expect(html).toContain(">주제</h2>");
    expect(html).toContain(">질문</dt>");
    expect(html).not.toContain(">과업</h2>");
    expect(html).not.toContain(">질의</dt>");
  });

  it("결과 주제에 제목과 배경을 각각 표시하고 배경이 비어 있으면 배경 행을 숨긴다", () => {
    const html = renderApiOpinionMap(apiResultFixture.opinionMap);

    expect(html).toContain(`<dt>제목</dt><dd>${apiResultFixture.title}</dd>`);
    expect(html).toContain(`<dt>배경</dt><dd>${apiResultFixture.description}</dd>`);

    useTaskResultQueryMock.mockReturnValue({
      data: { ...apiResultFixture, description: "" },
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    });
    const withoutBackground = renderToStaticMarkup(
      <VoteTaskResultScreen taskId={apiResultFixture.taskId} />,
    );

    expect(withoutBackground).toContain(`<dt>제목</dt><dd>${apiResultFixture.title}</dd>`);
    expect(withoutBackground).not.toContain("<dt>배경</dt>");
  });

  it("정량 결과 아래에 정성 요약 영역을 안내한다", () => {
    const html = renderToStaticMarkup(<VoteTaskResultScreen source="mock" taskId="task-01" />);

    expect(html).not.toContain("디자인 샘플");
    expect(html).toContain(">내 제출</span>");
    expect(html).not.toMatch(/class="[^"]*resultSummaryBadge[^"]*">AI<\/span>/);
    expect(html).not.toContain(">내 제출</h2>");
    expect(html).toContain(">같은 선택을 한 사람들은 어떤 이유를 들었을까요?</h3>");
    expect(html).toContain(">다른 선택을 한 사람들은 어떤 이유를 들었을까요?</h3>");
    expect(html).toContain(votePublishingResult.qualitativeSummary.sameChoice);
    expect(html).toContain(votePublishingResult.qualitativeSummary.differentChoices);
    expect(html).not.toContain("resultQualitativePlaceholder");
  });

  it("mock 비교용으로 AI 요약 뱃지를 표시할 수 있다", () => {
    const html = renderToStaticMarkup(
      <VoteTaskResultScreen showAiBadges source="mock" taskId="task-01" />,
    );

    expect(html.match(/class="[^"]*resultSummaryBadge[^"]*">AI<\/span>/g)).toHaveLength(2);
    expect(html).toContain(">같은 선택을 한 사람들은 어떤 이유를 들었을까요?</h3>");
    expect(html).toContain(">다른 선택을 한 사람들은 어떤 이유를 들었을까요?</h3>");
  });

  it("실제 API가 제공한 두 영역의 응답 이유 요약을 표시한다", () => {
    const html = renderApiOpinionMap(apiResultFixture.opinionMap);

    expect(apiResultFixture.opinionMap.status).toBe("AVAILABLE");
    if (apiResultFixture.opinionMap.status !== "AVAILABLE") return;
    expect(apiResultFixture.opinionMap.sameChoice.status).toBe("AVAILABLE");
    expect(apiResultFixture.opinionMap.otherChoices.status).toBe("AVAILABLE");
    if (
      apiResultFixture.opinionMap.sameChoice.status !== "AVAILABLE" ||
      apiResultFixture.opinionMap.otherChoices.status !== "AVAILABLE"
    ) {
      return;
    }
    expect(html).toContain(apiResultFixture.opinionMap.sameChoice.body);
    expect(html).toContain(apiResultFixture.opinionMap.otherChoices.body);
  });

  it("영역별 응답 없음과 요약 불가 상태를 안내한다", () => {
    const html = renderApiOpinionMap({
      status: "AVAILABLE",
      sameChoice: { status: "NO_RESPONSES", body: null },
      otherChoices: { status: "INSUFFICIENT_REASON", body: null },
    });

    expect(html).toContain("같은 선택을 한 참여자 응답이 없어요.");
    expect(html).toContain("요약할 수 있는 응답 이유가 충분하지 않아요.");
  });

  it("응답 이유 요약이 준비 중인 상태를 안내한다", () => {
    const html = renderApiOpinionMap({
      status: "PENDING",
      sameChoice: null,
      otherChoices: null,
    });

    expect(html).toContain("참여자 의견 요약</span></h3>");
    expect(html).toContain("참여자들의 의견을 요약하고 있어요.");
    expect(html).toContain('data-opinion-map-spinner="true"');
    expect(html).not.toContain(">같은 선택을 한 사람들은 어떤 이유를 들었을까요?</h3>");
  });

  it("응답 이유 요약을 제공할 수 없는 상태를 안내한다", () => {
    const html = renderApiOpinionMap({
      status: "UNAVAILABLE",
      sameChoice: null,
      otherChoices: null,
    });

    expect(html).toContain(">참여자 의견 요약</h3>");
    expect(html).toContain("이번 투표에서는 의견 요약을 제공할 수 없어요.");
    expect(html).not.toContain('data-opinion-map-spinner="true"');
    expect(html).not.toContain(">다른 선택을 한 사람들은 어떤 이유를 들었을까요?</h3>");
  });

  it("로컬 결과 mock에서 준비 중 상태를 표시한다", () => {
    const html = renderToStaticMarkup(
      <VoteTaskResultScreen mockOpinionMapStatus="PENDING" source="mock" taskId="task-01" />,
    );

    expect(html).toContain("참여자들의 의견을 요약하고 있어요.");
    expect(html).toContain('data-opinion-map-spinner="true"');
  });

  it("엑셀을 기준으로 만든 울산 트램 결과 mock을 표시한다", () => {
    const html = renderToStaticMarkup(<VoteTaskResultScreen source="mock" taskId="task-01" />);

    expect(html).toContain("울산 도시철도1호선(트램)");
    expect(html).toContain("울산도시철도 1호선 사업을 원안대로 진행해야 한다에 동의하십니까?");
    expect(html).toContain(">100명</strong>");
    expect(html).toContain(">동의한다</span>");
    expect(html).toContain("7명 · 7.0%");
    expect(html).toContain(">동의하지 않는다</span>");
    expect(html).toContain("60명 · 60.0%");
    expect(html).toContain(">잘모르겠다</span>");
    expect(html).toContain("33명 · 33.0%");
    expect(votePublishingResult.mySubmission).toMatchObject({
      respondentNumber: 1,
      selectedOptionId: "result-option-2",
    });
    expect(html).toContain(">동의하지 않는다</h3>");
    expect(html).not.toContain(">선택</dt>");
    expect(html).not.toContain(">이유</dt>");
    expect(html).toContain(votePublishingResult.mySubmission.finalReason);
  });
});
