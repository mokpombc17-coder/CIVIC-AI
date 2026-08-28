import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ChatRoomMessageSearchPanel,
  type ChatRoomMessageContextPanelController,
  type ChatRoomMessageSearchPanelController,
} from "@/components/chat-room-message-search-dialog";
import { ChatApiError } from "@/lib/chat/chat-fetch";
import type { ChatMessage } from "@/lib/chat/chat-room-contracts";

describe("Room message search panel", () => {
  it("검색 입력과 취소 action을 채팅 안의 접근 가능한 inline panel로 표시한다", () => {
    const html = renderDialog();

    expect(html).toContain('data-chat-room-message-search-panel="true"');
    expect(html).toContain('data-presentation="inline"');
    expect(html).toContain('id="chat-room-message-search-panel"');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('aria-modal="true"');
    expect(html).toContain('aria-label="메시지 검색 닫기"');
    expect(html).toContain('role="search"');
    expect(html).toContain('aria-label="채팅방 메시지 검색"');
    expect(html).toContain('placeholder="메시지 검색"');
    expect(html).toContain(">취소</button>");
    expect(html).toContain('maxLength="512"');
    expect(html).toContain("키보드의 검색 또는 Enter");
    expect(html).not.toContain("검색어를 입력한 뒤 검색을 실행해 주세요.");
    expect(html).not.toContain("두 글자 이상 입력해 주세요");
    expect(html).not.toContain("Room messages");
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
    expect(html).toContain("max-h-[min(240px,38dvh)]");
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
      error: new TypeError("fetch failed"),
      isError: true,
      validationMessage: "검색어에 제어 문자를 포함할 수 없습니다.",
    });

    expect(html.match(/role="alert"/g)).toHaveLength(2);
    expect(html).toContain('data-chat-form-feedback="validation-error"');
    expect(html).toContain('data-chat-form-feedback="request-error"');
    expect(html).toContain("검색어에 제어 문자를 포함할 수 없습니다.");
    expect(html).toContain("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
    expect(html).toContain("다시 시도");
    expect(html).toContain("bg-[#fff7e8]");
    expect(html).not.toContain("text-[#b42318]");
  });

  it("자동 반복하면 안 되는 서버 오류에는 다시 시도를 표시하지 않는다", () => {
    const html = renderDialog({
      appliedQuery: "환경 정책",
      draftQuery: "환경 정책",
      error: createChatApiError(500, "INTERNAL_ERROR"),
      isError: true,
    });

    expect(html).toContain("같은 요청을 자동으로 반복하지 않습니다.");
    expect(html).not.toContain(">다시 시도<");
  });

  it("사라진 Context target은 전용 안내를 표시하고 재시도하지 않는다", () => {
    const html = renderDialog({}, new Map(), {
      error: createChatApiError(404, "MESSAGE_NOT_FOUND"),
      isError: true,
      selectedMessageId: "message-2",
      targetMessageId: "message-2",
    });

    expect(html).toContain("메시지를 찾을 수 없습니다.");
    expect(html).toContain("메시지가 삭제되었거나 더 이상 접근할 수 없습니다.");
    expect(html).not.toContain(">다시 시도<");
    expect(html).toContain("검색 결과로 돌아가기");
    expect(html).toContain(">주변 대화</h2>");
    expect(html).toContain(">닫기</button>");
  });

  it("검색 결과 Context를 별도 창에 ASC로 표시하고 target을 강조한다", () => {
    const html = renderDialog({}, new Map([["membership-known", "참여자 2"]]), {
      hasNewer: true,
      hasOlder: true,
      messages: [
        createMessage("message-1", "membership-known", "이전 대화"),
        createDeletedMessage("message-2", "membership-known"),
        createMessage("message-3", "membership-known", "이후 대화"),
      ],
      selectedMessageId: "message-2",
      targetMessageId: "message-2",
      targetRoomSequence: 2,
    });

    expect(html).toContain('aria-label="검색 메시지 주변 대화"');
    expect(html).toContain('data-context-target="true"');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("검색한 메시지");
    expect(html).toContain("삭제된 메시지입니다.");
    expect(html).toContain("이전 대화 더 보기");
    expect(html).toContain("이후 대화 더 보기");
    expect(html).toContain("검색 결과로 돌아가기");
  });
});

function renderDialog(
  patch: Partial<ChatRoomMessageSearchPanelController> = {},
  participantDisplayNames: ReadonlyMap<string, string> = new Map(),
  contextPatch: Partial<ChatRoomMessageContextPanelController> = {},
): string {
  return renderToStaticMarkup(
    createElement(ChatRoomMessageSearchPanel, {
      context: createContextController(contextPatch),
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

function createContextController(
  patch: Partial<ChatRoomMessageContextPanelController> = {},
): ChatRoomMessageContextPanelController {
  return {
    closeContext: vi.fn(),
    error: null,
    failedDirection: null,
    hasNewer: false,
    hasOlder: false,
    isError: false,
    isLoadingNewer: false,
    isLoadingOlder: false,
    isPending: false,
    loadNewer: vi.fn(async () => undefined),
    loadOlder: vi.fn(async () => undefined),
    messages: [],
    openContext: vi.fn(),
    retry: vi.fn(async () => undefined),
    selectedMessageId: null,
    targetMessageId: null,
    targetRoomSequence: null,
    ...patch,
  };
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

function createMessage(
  messageId: string,
  senderMembershipId: string,
  content: string,
): ChatMessage {
  return {
    messageId,
    roomId: "room-01",
    roomSequence: Number(messageId.replace("message-", "")),
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

function createDeletedMessage(
  messageId: string,
  senderMembershipId: string,
): Extract<ChatMessage, { state: "DELETED_BY_AUTHOR" }> {
  const activeMessage = createMessage(messageId, senderMembershipId, "삭제 전 내용");

  return {
    ...activeMessage,
    content: null,
    deletedAt: "2026-08-11T00:01:00Z",
    messageVersion: 2,
    state: "DELETED_BY_AUTHOR",
    updatedAt: "2026-08-11T00:01:00Z",
  };
}
