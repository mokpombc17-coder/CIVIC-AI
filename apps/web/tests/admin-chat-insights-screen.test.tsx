import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminChatInsightsScreen } from "@/components/admin/admin-chat-insights-screen";
import { screenRegistry } from "@/lib/screens/registry";

describe("admin chat conversation insights", () => {
  it.each([
    ["A-CHAT-001", "채팅방 운영"],
    ["A-CHAT-002", "채팅방 상세"],
    ["A-CHAT-008", "채팅 통계"],
    ["A-CHAT-009", "대화 Export"],
  ])("%s 화면에서 방 선택·UTC 구간 Export 분석 흐름을 제공한다", (screenId, title) => {
    const screen = screenRegistry.find((candidate) => candidate.id === screenId);
    expect(screen?.status).toBe("FUNCTIONAL");
    if (!screen) throw new Error(`Missing screen: ${screenId}`);

    const html = renderToStaticMarkup(createElement(AdminChatInsightsScreen, { screen }));

    expect(html).toContain(`data-wireflow-screen="${screenId}"`);
    expect(html).toContain(`>${title}</h1>`);
    expect(html).toContain("ACTIVE · CLOSED");
    expect(html).toContain("관리자는 참여 여부와 관계없이 활성 방을 즉시 종료");
    expect(html).toContain("Export 요청·분석");
    expect(html).toContain('type="datetime-local"');
    expect(html).not.toContain("roomId");
    expect(html).not.toContain("userId");
  });
});
