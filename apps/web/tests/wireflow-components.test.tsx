import { renderToStaticMarkup } from "react-dom/server";
import type { Route } from "next";
import { describe, expect, it } from "vitest";
import { AdminChatRequestScreen } from "@/components/admin/admin-chat-request-screen";
import { AdminRoomCategoryScreen } from "@/components/admin/admin-room-category-screen";
import { AdminTaskScreen } from "@/components/admin/admin-task-screen";
import { ScreenFrame } from "@/components/screens/screen-frame";
import { AdminShell } from "@/components/shell/admin-shell";
import { ParticipantShell } from "@/components/shell/participant-shell";
import {
  WireflowBadge,
  WireflowButton,
  WireflowCard,
  WireflowField,
} from "@/components/wireflow/wireflow-primitives";
import { screenRegistry } from "@/lib/screens/registry";

describe("latest Wire Flow shared product UI", () => {
  it("renders product headings without Atlas review chrome or legacy status copy", () => {
    const login = screenRegistry.find((screen) => screen.id === "AUTH-001");
    if (!login) throw new Error("AUTH-001 missing");

    const html = renderToStaticMarkup(
      <ScreenFrame screen={login}>
        <p>content</p>
      </ScreenFrame>,
    );

    expect(html).toContain("<h1");
    expect(html).toContain(">로그인</h1>");
    expect(html).toContain('data-wireflow-screen="AUTH-001"');
    expect(html).not.toContain("civic-screen-id");
    expect(html).not.toContain(">인증<");
    expect(html).not.toContain("사용 가능");
    expect(html).not.toContain("이메일 인증을 완료한 계정으로 접속합니다.");
    expect(html).not.toContain("일반 아이폰");
  });

  it("routes login-originated 2FA heading back to login", () => {
    const verification = screenRegistry.find((screen) => screen.id === "AUTH-005");
    if (!verification) throw new Error("AUTH-005 missing");

    const signupHtml = renderToStaticMarkup(
      <ScreenFrame screen={verification}>
        <p>content</p>
      </ScreenFrame>,
    );
    const loginHtml = renderToStaticMarkup(
      <ScreenFrame backHref={"/login" as Route} screen={verification}>
        <p>content</p>
      </ScreenFrame>,
    );

    expect(signupHtml).toContain('href="/signup/pending"');
    expect(loginHtml).toContain('href="/login"');
  });

  it("frontend2의 공통 Platform Shell과 5개 표준 메뉴 안에 실제 화면을 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <ParticipantShell activeRoute="/home">
        <p>content</p>
      </ParticipantShell>,
    );

    expect(html.match(/data-platform-shell="true"/g)).toHaveLength(1);
    expect(html).toContain('data-participant-surface="true"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain(">홈<");
    expect(html).toContain(">AI<");
    expect(html).toContain(">토론방<");
    expect(html).toContain(">투표<");
    expect(html).toContain(">계정<");
    expect(html).toContain("/assets/platform-navigation/account.png");
  });

  it("renders the latest admin navigation without the legacy auth explainer", () => {
    const html = renderToStaticMarkup(
      <AdminShell activeRoute="/admin/users" permissions={["RAG_ADMIN"]}>
        <p>content</p>
      </AdminShell>,
    );

    expect(html).toContain("CIVIC AI");
    expect(html).toContain("ADMIN");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("사용자·권한");
    expect(html).toContain("문서 관리");
    expect(html).not.toContain("관리자 세션");
    expect(html).not.toContain("요청마다 권한 재확인");
  });

  it("채팅 운영 아래에 신청 목록과 채팅방 관리 두 항목을 제공한다", () => {
    const html = renderToStaticMarkup(
      <AdminShell activeRoute="/admin/chat/requests" permissions={["CHAT_ADMIN"]} role="ADMIN">
        <p>content</p>
      </AdminShell>,
    );

    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/admin/chat"');
    expect(html).toContain(">채팅 운영<");
    expect(html).toContain('href="/admin/chat/requests"');
    expect(html).toContain(">채팅방 신청 목록<");
    expect(html).toContain(">채팅방 관리<");
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain(">통계<");
    expect(html).not.toContain(">카테고리<");
  });

  it("채팅방 생성 요청 목록은 취소 필터와 고정된 공개·참여 방식을 표시하지 않는다", () => {
    const requestList = screenRegistry.find((screen) => screen.id === "A-CHAT-004");
    if (!requestList) throw new Error("A-CHAT-004 missing");

    const html = renderToStaticMarkup(<AdminChatRequestScreen query={{}} screen={requestList} />);

    expect(html).toContain(">승인 대기</button>");
    expect(html).toContain(">승인</button>");
    expect(html).toContain(">반려</button>");
    expect(html).not.toContain('aria-label="채팅 운영 메뉴"');
    expect(html).not.toContain('href="/admin/chat/categories"');
    expect(html).not.toContain('href="/admin/chat/export"');
    expect(html).not.toContain(">취소</button>");
    expect(html).not.toContain("공개·참여 방식");
    expect(html).not.toContain("목록 공개");
    expect(html).not.toContain("바로 참여");
  });

  it("카테고리 화면은 별도 채팅 운영 탭을 중복 노출하지 않는다", () => {
    const categoryScreen = screenRegistry.find((screen) => screen.id === "A-CHAT-007");
    if (!categoryScreen) throw new Error("A-CHAT-007 missing");

    const html = renderToStaticMarkup(<AdminRoomCategoryScreen screen={categoryScreen} />);

    expect(html).toContain("채팅방 카테고리 관리");
    expect(html).not.toContain('aria-label="채팅 운영 메뉴"');
    expect(html).not.toContain('href="/admin/chat/requests"');
    expect(html).not.toContain('href="/admin/chat/export"');
  });

  it("과업 생성 CTA를 목록 제목 우측에 두고 검색·필터 툴바와 분리한다", () => {
    const taskList = screenRegistry.find((screen) => screen.id === "A-TASK-001");
    if (!taskList) throw new Error("A-TASK-001 missing");

    const html = renderToStaticMarkup(<AdminTaskScreen query={{}} screen={taskList} />);
    const toolbarStart = html.indexOf('class="civic-domain-toolbar civic-task-list-toolbar"');
    const tableStart = html.indexOf('aria-label="과업 목록 표"');
    const toolbarHtml = html.slice(toolbarStart, tableStart);

    expect(html).toContain('class="wf-screen-heading-action"');
    expect(html).toContain('class="civic-primary-action civic-task-create-action" type="button"');
    expect(html).toContain('aria-label="새 과업 만들기"');
    expect(html).toContain('aria-label="과업 생성 단계"');
    expect(html).toContain("제목 · 상황 또는 사건");
    expect(html).not.toContain("질문 설명");
    expect(toolbarHtml).toContain("과업 제목 검색");
    expect(toolbarHtml).toContain('name="task-query"');
    expect(toolbarHtml).toContain('autoComplete="off"');
    expect(toolbarHtml).toContain('aria-label="과업 상태"');
    expect(toolbarHtml).not.toContain("새 과업 만들기");
  });

  it("shares accessible card, badge, field and button primitives", () => {
    const html = renderToStaticMarkup(
      <WireflowCard title="계정 정보">
        <WireflowBadge>복구</WireflowBadge>
        <WireflowField label="이메일" name="email" placeholder="name@example.com" type="email" />
        <WireflowButton type="submit">로그인</WireflowButton>
      </WireflowCard>,
    );

    expect(html).toContain('class="wf-card"');
    expect(html).toContain('class="wf-badge"');
    expect(html).toContain('<label for="wf-email">이메일</label>');
    expect(html).toContain('id="wf-email"');
    expect(html).toContain('class="wf-button wf-button-primary"');
  });
});
