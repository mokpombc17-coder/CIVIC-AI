import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AdminChatInsightsScreen,
  ChatStatisticsSummary,
} from "@/components/admin/admin-chat-insights-screen";
import type { ConversationExportMetrics } from "@/lib/chat/conversation-export";
import { screenRegistry } from "@/lib/screens/registry";

describe("admin chat conversation insights", () => {
  it.each([
    ["A-CHAT-001", "채팅 운영"],
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
    expect(html).toContain("운영 상태와 대화 맥락을 함께 확인합니다");
    expect(html).toContain("관리자는 참여 여부와 관계없이 활성 방을 즉시 종료");
    expect(html).toContain('aria-label="채팅 운영 메뉴"');
    expect(html).toContain('href="/admin/chat/requests"');
    expect(html).toContain('href="/admin/chat/categories"');
    expect(html).toContain("Export 요청·분석");
    expect(html).toContain('type="datetime-local"');
    expect(html).not.toContain("roomId");
    expect(html).not.toContain("userId");
  });

  it("통계는 핵심 지표와 일자별 추이만 표시한다", () => {
    const metrics: ConversationExportMetrics = {
      totalMessages: 42,
      retainedMessages: 38,
      deletedMessages: 4,
      authorCount: 8,
      editedMessages: 3,
      editRate: 3 / 42,
      deletionRate: 4 / 42,
      events: { created: 42, updated: 3, deleted: 4 },
      authors: [{ label: "작성자 1", count: 12 }],
      hourly: [{ key: "09", label: "09시", count: 7 }],
      daily: [{ key: "2026-08-30", label: "8월 30일", count: 42 }],
      keywords: [{ term: "운영", count: 5 }],
      sentiment: { positive: 4, neutral: 20, negative: 2 },
      topics: [{ label: "정책·제도", count: 6 }],
    };

    const html = renderToStaticMarkup(<ChatStatisticsSummary metrics={metrics} />);

    for (const label of ["전체 메시지", "작성자", "수정 메시지", "삭제 메시지"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("일자별 메시지 추이");
    expect(html).not.toContain("변경 이벤트");
    expect(html).not.toContain("시간대별 메시지");
    expect(html).not.toContain("사용자별 메시지");
    expect(html).not.toContain("감성 표현 참고치");
    expect(html).not.toContain("자주 등장한 표현");
    expect(html).not.toContain("규칙 기반 주제 묶음");
  });
});
