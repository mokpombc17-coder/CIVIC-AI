import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AdminChatInsightsScreen,
  ChatStatisticsSummary,
  resolveConversationAnalysisRange,
} from "@/components/admin/admin-chat-insights-screen";
import type { ConversationExportMetrics } from "@/lib/chat/conversation-export";
import { screenRegistry } from "@/lib/screens/registry";

describe("admin chat conversation insights", () => {
  it("채팅방 관리는 배너와 내부 탭 없이 과업 관리형 목록을 제공한다", () => {
    const screen = screenRegistry.find((candidate) => candidate.id === "A-CHAT-001");
    expect(screen?.status).toBe("FUNCTIONAL");
    if (!screen) throw new Error("Missing screen: A-CHAT-001");

    const html = renderToStaticMarkup(
      createElement(AdminChatInsightsScreen, { query: {}, screen }),
    );

    expect(html).toContain('data-wireflow-screen="A-CHAT-001"');
    expect(html).toContain(">채팅방 관리</h1>");
    expect(html).toContain('aria-label="채팅방 관리 목록"');
    expect(html).toContain(">채팅방 이름</th>");
    expect(html).toContain(">작업</th>");
    expect(html).not.toContain('href="/admin/chat/categories"');
    expect(html).not.toContain("ROOM OPERATIONS · EXPORT V1");
    expect(html).not.toContain("운영 상태와 대화 맥락을 함께 확인합니다");
    expect(html).not.toContain('aria-label="채팅 운영 메뉴"');
    expect(html).not.toContain('aria-label="분석 기간"');
    expect(html).not.toContain('href="/admin/chat/export"');
    expect(html).not.toContain("roomId");
    expect(html).not.toContain("userId");
  });

  it("roomId가 있으면 통계 Drawer 진입 상태를 복원한다", () => {
    const screen = screenRegistry.find((candidate) => candidate.id === "A-CHAT-001");
    if (!screen) throw new Error("Missing screen: A-CHAT-001");

    const html = renderToStaticMarkup(
      createElement(AdminChatInsightsScreen, { query: { roomId: "room-one" }, screen }),
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain("채팅방 통계");
    expect(html).not.toContain("운영 상태와 대화 맥락을 함께 확인합니다");
  });

  it("전체 기간은 채팅방 개설 시각부터 현재까지로 계산한다", () => {
    const range = resolveConversationAnalysisRange({
      createdAt: "2026-08-01T00:00:00.000Z",
      fromLocal: "",
      now: new Date("2026-08-30T09:00:00.000Z"),
      period: "all",
      toLocal: "",
    });

    expect(range).toEqual({
      fromInclusive: "2026-08-01T00:00:00.000Z",
      toExclusive: "2026-08-30T09:00:00.000Z",
    });
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
