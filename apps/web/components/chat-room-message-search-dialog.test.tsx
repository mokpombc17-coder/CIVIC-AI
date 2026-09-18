import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ChatRoomMessageSearchPanel,
  type ChatRoomMessageSearchNavigationController,
  type ChatRoomMessageSearchPanelController,
} from "@/components/chat-room-message-search-dialog";
import { ChatApiError } from "@/lib/chat/chat-fetch";
import type { ChatMessage } from "@/lib/chat/chat-room-contracts";

describe("Room message search panel", () => {
  it("검색·초기화·결과 이동·닫기 action을 한 줄에 표시한다", () => {
    const html = renderPanel({
      controller: {
        appliedQuery: "환경 정책",
        draftQuery: "환경 정책",
        hasNextPage: true,
        messages: [createMessage("message-2"), createMessage("message-1")],
      },
    });

    expect(html).toContain('data-chat-room-message-search-panel="true"');
    expect(html).toContain('data-presentation="inline"');
    expect(html).toContain('id="chat-room-message-search-panel"');
    expect(html).not.toContain('role="dialog"');
    expect(html).toContain('aria-label="토론방 메시지 검색"');
    expect(html).toContain('placeholder="메시지 검색"');
    expect(html).toContain('aria-label="검색 초기화"');
    expect(html).toContain('aria-label="더 오래된 검색 결과"');
    expect(html).toContain('aria-label="더 최신 검색 결과"');
    expect(html).toContain('aria-label="메시지 검색 닫기"');
    expect(html).toContain("1 / 2+");
    expect(html).toContain(">닫기</button>");
    expect(html).toContain('maxLength="512"');
    expect(html).not.toContain("검색 결과</p>");
    expect(html).not.toContain("이동 하기");
    expect(html).not.toContain("더 오래된 메시지 검색");
  });

  it("검색이 완료되면 누적 결과 수를 확정하고 현재 위치를 표시한다", () => {
    const html = renderPanel({
      controller: {
        appliedQuery: "환경 정책",
        draftQuery: "환경 정책",
        hasNextPage: false,
        messages: [createMessage("message-2"), createMessage("message-1")],
      },
      navigation: {
        canNavigateNewer: true,
        canNavigateOlder: false,
        currentResultIndex: 1,
      },
    });

    expect(html).toContain("2 / 2");
    expect(html).not.toContain("2 / 2+");
  });

  it("빈 중간 페이지는 검색 중으로, 완료된 빈 결과는 0 / 0으로 표시한다", () => {
    const intermediateHtml = renderPanel({
      controller: {
        appliedQuery: "환경 정책",
        draftQuery: "환경 정책",
        hasNextPage: true,
      },
      navigation: { currentResultIndex: null },
    });
    const completeHtml = renderPanel({
      controller: {
        appliedQuery: "환경 정책",
        draftQuery: "환경 정책",
        hasNextPage: false,
      },
      navigation: { currentResultIndex: null },
    });

    expect(intermediateHtml).toContain("검색 중…");
    expect(intermediateHtml).not.toContain("0 / 0+");
    expect(completeHtml).toContain("0 / 0");
  });

  it("validation과 요청 실패를 alert로 표시한다", () => {
    const html = renderPanel({
      controller: {
        appliedQuery: "환경 정책",
        draftQuery: "환경\n정책",
        error: new TypeError("fetch failed"),
        isError: true,
        validationMessage: "검색어에 제어 문자를 포함할 수 없습니다.",
      },
    });

    expect(html.match(/role="alert"/g)).toHaveLength(2);
    expect(html).toContain('data-chat-form-feedback="validation-error"');
    expect(html).toContain('data-chat-form-feedback="request-error"');
    expect(html).toContain("검색어에 제어 문자를 포함할 수 없습니다.");
    expect(html).toContain("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
    expect(html).toContain("다시 시도");
    expect(html).toContain("bg-[#fff7e8]");
  });

  it("자동 반복하면 안 되는 서버 오류에는 다시 시도를 표시하지 않는다", () => {
    const html = renderPanel({
      controller: {
        appliedQuery: "환경 정책",
        draftQuery: "환경 정책",
        error: createChatApiError(500, "INTERNAL_ERROR"),
        isError: true,
      },
    });

    expect(html).toContain("같은 요청을 자동으로 반복하지 않습니다.");
    expect(html).not.toContain(">다시 시도<");
  });
});

function renderPanel({
  controller: controllerPatch = {},
  navigation: navigationPatch = {},
}: Readonly<{
  controller?: Partial<ChatRoomMessageSearchPanelController>;
  navigation?: Partial<ChatRoomMessageSearchNavigationController>;
}> = {}): string {
  return renderToStaticMarkup(
    createElement(ChatRoomMessageSearchPanel, {
      controller: {
        appliedQuery: undefined,
        applySearch: vi.fn(),
        clearSearch: vi.fn(),
        draftQuery: "",
        endComposition: vi.fn(),
        error: null,
        hasNextPage: false,
        isComposing: false,
        isError: false,
        isFetching: false,
        isFetchingNextPage: false,
        isPending: false,
        messages: [],
        rateLimitRetryAfterMs: undefined,
        retry: vi.fn(async () => undefined),
        setDraftQuery: vi.fn(),
        startComposition: vi.fn(),
        validationMessage: undefined,
        ...controllerPatch,
      },
      navigation: {
        canNavigateNewer: false,
        canNavigateOlder: true,
        currentResultIndex: 0,
        isSeekingOlderResult: false,
        navigateToNewerResult: vi.fn(),
        navigateToOlderResult: vi.fn(),
        ...navigationPatch,
      },
      onClose: vi.fn(),
    }),
  );
}

function createChatApiError(status: number, code: string): ChatApiError {
  return new ChatApiError(status, "", "http://localhost:8082/rooms/room-01/messages/search", {
    type: `urn:hamcheeze:problem:${code.toLowerCase()}`,
    title: "Message search failed",
    status,
    detail: "Message search failed.",
    instance: "/api/v1/rooms/room-01/messages/search",
    code,
    replayed: false,
    retryable: false,
  });
}

function createMessage(messageId: string): ChatMessage {
  return {
    messageId,
    roomId: "room-01",
    roomSequence: Number(messageId.replace("message-", "")),
    senderMembershipId: "membership-01",
    clientMessageId: `client-${messageId}`,
    content: "환경 정책입니다.",
    state: "ACTIVE",
    countable: true,
    messageVersion: 1,
    createdAt: "2026-08-11T00:00:00Z",
    updatedAt: "2026-08-11T00:00:00Z",
    deletedAt: null,
  };
}
