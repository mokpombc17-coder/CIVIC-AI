import { renderToStaticMarkup } from "react-dom/server";
import type { Route } from "next";
import { describe, expect, it } from "vitest";
import { AdminChatRequestScreen } from "@/components/admin/admin-chat-request-screen";
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

  it("채팅방 생성 요청 목록은 취소 상태 필터를 제공하지 않는다", () => {
    const requestList = screenRegistry.find((screen) => screen.id === "A-CHAT-004");
    if (!requestList) throw new Error("A-CHAT-004 missing");

    const html = renderToStaticMarkup(<AdminChatRequestScreen query={{}} screen={requestList} />);

    expect(html).toContain(">승인 대기</button>");
    expect(html).toContain(">승인</button>");
    expect(html).toContain(">반려</button>");
    expect(html).not.toContain(">취소</button>");
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
