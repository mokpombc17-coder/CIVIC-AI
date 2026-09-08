import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdminLoadingView, ParticipantLoadingView } from "./loading-skeletons";

vi.mock("next/navigation", () => ({
  usePathname: () => "/home",
}));

describe("route-aware loading skeletons", () => {
  it("홈의 고정 헤더와 정적 안내 카드는 shimmer 없이 실제 구조로 유지한다", () => {
    const markup = renderToStaticMarkup(<ParticipantLoadingView pathname="/home" />);

    expect(markup).toContain("CIVIC.AI");
    expect(markup).toContain("배우고, 토론하고, 함께 결정합니다.");
    expect(markup).toContain('data-wireflow-layout="participant-home"');
    expect(markup).not.toContain("civic-skeleton-header-title");
    expect(markup).not.toContain("civic-skeleton-card");
  });

  it("AI 로딩 화면은 실제 상단 바와 입력창을 유지하고 대화 데이터만 skeleton 처리한다", () => {
    const markup = renderToStaticMarkup(<ParticipantLoadingView pathname="/rag" />);

    expect(markup).toMatch(/<h1[^>]*>AI<\/h1>/);
    expect(markup).toMatch(/aria-current="page"[^>]*href="\/rag"/);
    expect(markup).toContain('placeholder="궁금한 내용을 입력해 주세요"');
    expect(markup.match(/civic-skeleton-chat-question/gu)).toHaveLength(2);
    expect(markup.match(/civic-skeleton-chat-answer/gu)).toHaveLength(2);
    expect(markup).not.toContain("civic-skeleton-header-title");
    expect(markup).toContain('aria-label="이전 화면으로 돌아가기"');
    expect(markup).toContain('data-state="disabled"');
    expect(markup).toContain("disabled");
  });

  it("계정 루트 로딩 화면은 안내 문구 대신 스피너를 표시하고 비활성 뒤로가기를 유지한다", () => {
    const markup = renderToStaticMarkup(<ParticipantLoadingView pathname="/mypage" />);

    expect(markup).toMatch(/<h1[^>]*>계정<\/h1>/);
    expect(markup).toContain('aria-label="이전 화면으로 돌아가기"');
    expect(markup).toContain('data-state="disabled"');
    expect(markup).toContain("disabled");
    expect(markup).toContain('class="civic-account-loading-spinner"');
    expect(markup).not.toContain("비밀번호와 2단계 인증을 관리합니다.");
    expect(markup).not.toContain("Vote 설문 응답을 작성·확인합니다.");
  });

  it("하위 참여자 화면의 제목과 뒤로가기를 현재 경로에 맞춘다", () => {
    const markup = renderToStaticMarkup(<ParticipantLoadingView pathname="/mypage/profile" />);

    expect(markup).toMatch(/<h1[^>]*>계정<\/h1>/);
    expect(markup).toContain('aria-label="이전 화면으로 돌아가기"');
    expect(markup).toContain('href="/mypage"');
    expect(markup).toContain(
      "비밀번호를 변경하면 기존에 로그인된 모든 기기에서 자동으로 로그아웃됩니다.",
    );
    expect(markup).not.toContain("변경하면 모든 기기에서 다시 로그인해야 합니다.");
  });

  it("Vote 설문 화면은 실제 클라이언트 로딩 안내를 그대로 사용한다", () => {
    const markup = renderToStaticMarkup(<ParticipantLoadingView pathname="/mypage/survey" />);

    expect(markup).toContain("설문 확인 중");
    expect(markup).toContain("Vote 서버에서 현재 설문을 불러오는 중입니다…");
    expect(markup).not.toContain("civic-skeleton");
  });

  it("데이터를 기다리지 않는 준비 중 화면은 skeleton으로 바꾸지 않는다", () => {
    const markup = renderToStaticMarkup(<ParticipantLoadingView pathname="/chat" />);

    expect(markup).toContain("활성 채팅방 목록");
    expect(markup).toContain("준비 중");
    expect(markup).not.toContain("civic-skeleton");
    expect(markup).not.toContain("목록 검색");
  });

  it("사용자 목록은 제목, 검색창, 필터와 표 머리글을 고정 UI로 렌더한다", () => {
    const markup = renderToStaticMarkup(<AdminLoadingView pathname="/admin/users" />);

    expect(markup).toMatch(/<h1[^>]*>사용자·권한<\/h1>/);
    expect(markup).toContain('placeholder="이메일 주소를 검색해 주세요."');
    expect(markup).toContain('class="console-search-input"');
    expect(markup).toContain("활성");
    expect(markup).toContain("비활성");
    expect(markup).toContain("운영 권한");
    expect(markup).toContain("최근 활동");
    expect(markup).toContain("civic-skeleton-table-cell");
    expect(markup).not.toContain("civic-skeleton-header-title");
  });

  it("RAG 관리 화면은 폴더와 문서 검색 도구를 유지하고 문서 행만 skeleton 처리한다", () => {
    const markup = renderToStaticMarkup(<AdminLoadingView pathname="/admin/rag" />);

    expect(markup).toMatch(/<h1[^>]*>문서 관리<\/h1>/);
    expect(markup).toContain("<h2>폴더</h2>");
    expect(markup).toContain('placeholder="문서명을 검색해 주세요."');
    expect(markup).toContain('class="console-search-input"');
    expect(markup).toContain("처리 상태");
    expect(markup).toContain("civic-skeleton-folder-row");
    expect(markup).toContain("civic-skeleton-table-cell");
  });

  it("관리 상세 화면도 실제 제목과 목록 복귀 링크를 먼저 표시한다", () => {
    const markup = renderToStaticMarkup(<AdminLoadingView pathname="/admin/tasks/create" />);

    expect(markup).toMatch(/<h1[^>]*>과업 관리<\/h1>/);
    expect(markup).toContain('href="/admin/tasks"');
    expect(markup).not.toContain("civic-skeleton-header-title");
  });
});
