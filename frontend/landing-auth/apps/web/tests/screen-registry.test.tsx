import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminShell } from "@/components/shell/admin-shell";
import { ParticipantShell } from "@/components/shell/participant-shell";
import { ComingSoonScreen } from "@/components/screens/coming-soon-screen";
import { getScreenByRoute, screenRegistry, type ScreenDefinition } from "@/lib/screens/registry";

describe("canonical screen registry adapter", () => {
  it("68개 route와 52/16 상태를 손실 없이 제공한다", () => {
    expect(screenRegistry).toHaveLength(68);
    expect(new Set(screenRegistry.map((screen) => screen.route))).toHaveLength(68);
    expect(screenRegistry.filter((screen) => screen.status === "FUNCTIONAL")).toHaveLength(52);
    expect(screenRegistry.filter((screen) => screen.status === "PLACEHOLDER")).toHaveLength(16);
  });

  it("query나 trailing slash가 없는 pathname만 정규화해 정확한 화면을 찾는다", () => {
    expect(getScreenByRoute("/chat/")?.id).toBe("U-CHAT-001");
    expect(getScreenByRoute("/admin/tasks/results")?.id).toBe("A-TASK-005");
    expect(getScreenByRoute("/vote/results")?.id).toBe("U-VOTE-009");
    expect(getScreenByRoute("/mypage/profile")?.id).toBe("U-ACCOUNT-002");
    expect(getScreenByRoute("/mypage/security")?.id).toBe("U-ACCOUNT-002");
    expect(getScreenByRoute("/mypage/survey")?.id).toBe("U-ACCOUNT-003");
    expect(getScreenByRoute("/rag/source")).toBeUndefined();
    expect(getScreenByRoute("/rag/source/page")).toBeUndefined();
    expect(getScreenByRoute("/CHAT")).toBeUndefined();
    expect(getScreenByRoute("/unknown")).toBeUndefined();
  });
});

describe("coming-soon screen presentation", () => {
  it.each(screenRegistry.filter((screen) => screen.status === "PLACEHOLDER"))(
    "$id 제목·ID·준비 중 상태를 접근 가능한 구조로 렌더링한다",
    (screen) => {
      const html = renderPlaceholder(screen);

      const heading = screen.audience === "ADMIN" ? "h1" : "h2";
      expect(html).toContain(
        `<${heading} id="coming-soon-title">${screen.canonical_title}</${heading}>`,
      );
      expect(html).toContain(screen.id);
      expect(html).toContain('role="status"');
      expect(html).toContain("준비 중");
      expect(html).not.toContain("<form");
      const placeholder = html.match(
        /<section aria-labelledby="coming-soon-title"[\s\S]*?<\/section>/,
      )?.[0];
      expect(placeholder).toBeDefined();
      expect(placeholder).not.toContain("<button");
    },
  );

  it("참여자는 frontend2 Platform Shell, 관리자는 실제 UI 관리자 메뉴를 유지한다", () => {
    const participant = renderPlaceholder(getScreen("U-CHAT-001"));
    const admin = renderPlaceholder(getScreen("A-CHAT-003"));

    expect(participant).toContain('aria-label="참여자 주요 메뉴"');
    expect(participant).toContain("토론방");
    expect(participant).toContain("투표");
    expect(admin).toContain('aria-label="관리자 주요 메뉴"');
    expect(admin).toContain("시뮬레이션");
  });
});

function getScreen(id: string): ScreenDefinition {
  const screen = screenRegistry.find((candidate) => candidate.id === id);
  if (!screen) throw new Error(`Missing test screen: ${id}`);
  return screen;
}

function renderPlaceholder(screen: ScreenDefinition): string {
  const content = createElement(ComingSoonScreen, { screen });
  const shell =
    screen.audience === "ADMIN" ? (
      <AdminShell
        activeRoute={screen.route}
        permissions={["CHAT_ADMIN", "SIMULATION_ADMIN"]}
        role="ADMIN"
      >
        {content}
      </AdminShell>
    ) : (
      <ParticipantShell activeRoute={screen.route}>{content}</ParticipantShell>
    );
  return renderToStaticMarkup(shell);
}
