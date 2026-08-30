import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AdminChatInsightsScreen,
  ChatStatisticsSummary,
  chatInsightsPath,
  chatInsightsTabForScreen,
  conversationAuthorBuckets,
  resolveConversationAnalysisRange,
} from "@/components/admin/admin-chat-insights-screen";
import type { ConversationExportMetrics } from "@/lib/chat/conversation-export";
import { screenRegistry } from "@/lib/screens/registry";

describe("admin chat conversation insights", () => {
  it.each([
    ["A-CHAT-001", "토론방 운영", "대화 분석"],
    ["A-CHAT-002", "토론방 상세", "대화 분석"],
    ["A-CHAT-008", "채팅 통계", "통계"],
    ["A-CHAT-009", "토론방 운영", "대화 분석"],
  ])("%s 화면에서 방 선택 중심의 자동 분석 흐름을 제공한다", (screenId, title, activeTab) => {
    const screen = screenRegistry.find((candidate) => candidate.id === screenId);
    expect(screen?.status).toBe("FUNCTIONAL");
    if (!screen) throw new Error(`Missing screen: ${screenId}`);

    const html = renderToStaticMarkup(createElement(AdminChatInsightsScreen, { screen }));

    expect(html).toContain(`data-wireflow-screen="${screenId}"`);
    expect(html).toContain(`>${title}</h1>`);
    expect(html).toContain("토론방 목록");
    expect(html).not.toContain("ACTIVE · CLOSED");
    expect(html).not.toContain("운영 상태와 대화 맥락을 함께 확인합니다");
    expect(html).not.toContain('aria-label="토론방 운영 메뉴"');
    expect(html).toContain('aria-label="토론방 운영 섹션"');
    expect(html).toContain('aria-label="분석 보기 탭"');
    expect(html).toMatch(
      new RegExp(`<button aria-selected="true"[^>]*class="console-tab"[^>]*>${activeTab}</button>`),
    );
    expect(html).toContain('aria-label="분석 기간"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(">전체 기간</button>");
    expect(html).not.toContain("개설 이후의 전체 대화를 자동으로 표시합니다");
    expect(html).not.toContain('href="/admin/chat/export"');
    expect(html).not.toContain("Export 요청·분석");
    expect(html).not.toContain('type="datetime-local"');
    expect(html).not.toContain("roomId");
    expect(html).not.toContain("userId");
  });

  it("탭 초기값은 화면 ID에서, 탭 URL은 선택한 방을 유지한 채 계산한다", () => {
    expect(chatInsightsTabForScreen("A-CHAT-001")).toBe("analysis");
    expect(chatInsightsTabForScreen("A-CHAT-002")).toBe("analysis");
    expect(chatInsightsTabForScreen("A-CHAT-009")).toBe("analysis");
    expect(chatInsightsTabForScreen("A-CHAT-008")).toBe("statistics");

    expect(chatInsightsPath("analysis", null)).toBe("/admin/chat");
    expect(chatInsightsPath("statistics", null)).toBe("/admin/chat/statistics");
    expect(chatInsightsPath("analysis", "room-1")).toBe("/admin/chat?roomId=room-1");
    expect(chatInsightsPath("statistics", "room 1")).toBe("/admin/chat/statistics?roomId=room%201");
  });

  it("전체 기간은 토론방 개설 시각부터 현재까지로 계산한다", () => {
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

  it("통계는 최근 7일 지표와 일자·사용자별 추이를 표시한다", () => {
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

    const html = renderToStaticMarkup(
      <ChatStatisticsSummary
        authorEmailLabels={
          new Map([
            ["user-1", "alpha@civic.test"],
            ["user-2", "beta@civic.test"],
          ])
        }
        messages={[
          {
            messageSequence: 1,
            userId: "user-1",
            content: "최근 메시지",
            createdAt: "2026-08-30T00:00:00Z",
            deleted: false,
          },
          {
            messageSequence: 2,
            userId: "user-2",
            content: "최근 메시지",
            createdAt: "2026-08-29T00:00:00Z",
            deleted: false,
          },
          {
            messageSequence: 3,
            userId: "user-3",
            content: "이전 메시지",
            createdAt: "2026-08-20T00:00:00Z",
            deleted: false,
          },
        ]}
        metrics={metrics}
        windowEnd="2026-08-31T00:00:00Z"
      />,
    );

    for (const label of ["전체 메시지", "작성자", "최근 7일 사용자", "최근 7일 메시지"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("최근 7일 사용자</span><strong>2명");
    expect(html).toContain("최근 7일 메시지</span><strong>2건");
    expect(html).toContain("일자별 메시지 추이");
    expect(html).toContain("사용자별 메시지 수");
    expect(html).toContain("alpha@civic.test");
    expect(html).toContain("beta@civic.test");
    expect(html).not.toContain("수정 메시지");
    expect(html).not.toContain("삭제 메시지");
    expect(html).not.toContain("변경 이벤트");
    expect(html).not.toContain("시간대별 메시지");
    expect(html).not.toContain("감성 표현 참고치");
    expect(html).not.toContain("자주 등장한 표현");
    expect(html).not.toContain("규칙 기반 주제 묶음");
  });

  it("관리자 이메일 라벨이 없을 때만 작성자 순번을 대체 표기로 사용한다", () => {
    const messages = [
      {
        messageSequence: 1,
        userId: "user-1",
        content: "첫 메시지",
        createdAt: "2026-08-30T00:00:00Z",
        deleted: false,
      },
      {
        messageSequence: 2,
        userId: "user-2",
        content: "둘째 메시지",
        createdAt: "2026-08-30T00:01:00Z",
        deleted: false,
      },
    ] as const;

    expect(conversationAuthorBuckets(messages, new Map([["user-1", "alpha@civic.test"]]))).toEqual([
      { key: "user-1", label: "alpha@civic.test", count: 1 },
      { key: "user-2", label: "작성자 2", count: 1 },
    ]);
  });
});
