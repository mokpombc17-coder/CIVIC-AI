import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ChatRoomMessageSearchDialog,
  type ChatRoomMessageSearchDialogController,
} from "@/components/chat-room-message-search-dialog";
import type { ChatMessage } from "@/lib/chat/chat-room-contracts";

describe("Room message search dialog", () => {
  it("버튼 검색과 UTF-16 512자 입력 경계를 접근 가능한 dialog로 표시한다", () => {
    const html = renderDialog();

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('role="search"');
    expect(html).toContain('aria-label="채팅방 메시지 검색"');
    expect(html).toContain('maxLength="512"');
    expect(html).toContain("검색 버튼을 누르면");
    expect(html).toContain("검색어를 입력하고 검색 버튼을 눌러 주세요.");
  });

  it("검색 결과에 참여자 프로필과 fallback을 표시한다", () => {
    const html = renderDialog(
      {
        appliedQuery: "환경 정책",
        draftQuery: "환경 정책",
        messages: [
          createMessage("message-1", "membership-known", "환경 정책입니다."),
          createMessage("message-2", "membership-missing", "두 번째 결과"),
        ],
      },
      new Map([["membership-known", "참여자 2"]]),
    );

    expect(html).toContain('aria-label="메시지 검색 결과"');
    expect(html).toContain('data-message-id="message-1"');
    expect(html).toContain("참여자 2");
    expect(html).toContain("알 수 없는 참여자");
    expect(html).toContain("환경 정책입니다.");
  });

  it("빈 중간 페이지를 최종 검색 결과 없음과 구분한다", () => {
    const intermediateHtml = renderDialog({
      appliedQuery: "환경 정책",
      draftQuery: "환경 정책",
      hasNextPage: true,
    });
    const completeHtml = renderDialog({
      appliedQuery: "환경 정책",
      draftQuery: "환경 정책",
      hasNextPage: false,
    });

    expect(intermediateHtml).toContain("이번 검색 구간에는 일치하는 메시지가 없습니다.");
    expect(intermediateHtml).toContain("더 오래된 메시지 검색");
    expect(completeHtml).toContain("검색 결과가 없습니다.");
  });

  it("validation과 요청 실패를 alert로 표시한다", () => {
    const html = renderDialog({
      appliedQuery: "환경 정책",
      draftQuery: "환경\n정책",
      error: new Error("검색 서버에 연결할 수 없습니다."),
      isError: true,
      validationMessage: "검색어에 제어 문자를 포함할 수 없습니다.",
    });

    expect(html.match(/role="alert"/g)).toHaveLength(2);
    expect(html).toContain("검색어에 제어 문자를 포함할 수 없습니다.");
    expect(html).toContain("검색 서버에 연결할 수 없습니다.");
    expect(html).toContain("다시 시도");
  });
});

function renderDialog(
  patch: Partial<ChatRoomMessageSearchDialogController> = {},
  participantDisplayNames: ReadonlyMap<string, string> = new Map(),
): string {
  return renderToStaticMarkup(
    createElement(ChatRoomMessageSearchDialog, {
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
        loadMore: vi.fn(async () => undefined),
        messages: [],
        rateLimitRetryAfterMs: undefined,
        retry: vi.fn(async () => undefined),
        setDraftQuery: vi.fn(),
        startComposition: vi.fn(),
        validationMessage: undefined,
        ...patch,
      },
      onClose: vi.fn(),
      participantDisplayNames,
    }),
  );
}

function createMessage(
  messageId: string,
  senderMembershipId: string,
  content: string,
): ChatMessage {
  return {
    messageId,
    roomId: "room-01",
    roomSequence: messageId === "message-1" ? 2 : 1,
    senderMembershipId,
    clientMessageId: `client-${messageId}`,
    content,
    state: "ACTIVE",
    countable: true,
    messageVersion: 1,
    createdAt: "2026-08-11T00:00:00Z",
    updatedAt: "2026-08-11T00:00:00Z",
    deletedAt: null,
  };
}
