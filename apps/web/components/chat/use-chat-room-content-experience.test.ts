import { describe, expect, it } from "vitest";
import {
  canLoadOlderChatRoomMessages,
  createChatRoomMessageHistoryFeedback,
  createChatRoomMessageNavigationFeedback,
  toChatRoomErrorMessage,
} from "./use-chat-room-content-experience";

describe("ChatRoom content experience", () => {
  it("실시간 이력이 비활성화되면 캐시를 표시하되 과거 이력은 더 불러오지 않는다", () => {
    expect(
      canLoadOlderChatRoomMessages({
        contextHasOlder: false,
        contextNavigationActive: false,
        hasNextPage: true,
        isHistoryEnabled: false,
        roomClosed: false,
      }),
    ).toBe(false);
    expect(
      canLoadOlderChatRoomMessages({
        contextHasOlder: false,
        contextNavigationActive: false,
        hasNextPage: true,
        isHistoryEnabled: true,
        roomClosed: false,
      }),
    ).toBe(true);
  });

  it("최신과 떨어진 구간에서는 그 구간에 이전 페이지가 있을 때만 더 불러온다", () => {
    const input = {
      contextNavigationActive: true,
      hasNextPage: false,
      isHistoryEnabled: true,
      roomClosed: false,
    };

    expect(canLoadOlderChatRoomMessages({ ...input, contextHasOlder: true })).toBe(true);
    expect(canLoadOlderChatRoomMessages({ ...input, contextHasOlder: false })).toBe(false);
    expect(
      canLoadOlderChatRoomMessages({ ...input, contextHasOlder: true, roomClosed: true }),
    ).toBe(false);
  });

  it("비활성 Room의 구독 준비 안내는 숨기고 실제 loading만 표시한다", () => {
    expect(
      createChatRoomMessageHistoryFeedback({
        error: null,
        isHistoryEnabled: false,
        isError: false,
        isPending: true,
        messageCount: 0,
      }),
    ).toBeNull();
    expect(
      createChatRoomMessageHistoryFeedback({
        error: null,
        isHistoryEnabled: true,
        isError: false,
        isPending: true,
        messageCount: 0,
      }),
    ).toEqual({
      kind: "notice",
      message: "최근 메시지를 불러오고 있습니다.",
    });
  });

  it("오류, 빈 이력과 정상 메시지 상태를 구분한다", () => {
    expect(
      createChatRoomMessageHistoryFeedback({
        error: new Error("history failed"),
        isHistoryEnabled: true,
        isError: true,
        isPending: false,
        messageCount: 0,
      }),
    ).toEqual({
      kind: "error",
      message: "history failed",
      title: "메시지 이력을 불러오지 못했습니다.",
    });
    expect(
      createChatRoomMessageHistoryFeedback({
        error: null,
        isHistoryEnabled: true,
        isError: false,
        isPending: false,
        messageCount: 0,
      }),
    ).toEqual({
      kind: "notice",
      message: "아직 작성된 메시지가 없습니다.",
    });
    expect(
      createChatRoomMessageHistoryFeedback({
        error: null,
        isHistoryEnabled: true,
        isError: false,
        isPending: false,
        messageCount: 1,
      }),
    ).toBeNull();
  });

  it("알 수 없는 오류에는 공통 fallback 문구를 사용한다", () => {
    expect(toChatRoomErrorMessage("unknown")).toBe("알 수 없는 오류가 발생했습니다.");
  });

  it("검색 메시지 이동의 loading, error, ready 상태를 구분한다", () => {
    expect(
      createChatRoomMessageNavigationFeedback({
        error: null,
        isError: false,
        isPending: true,
        messages: [],
        targetMessageId: "message-01",
      }),
    ).toEqual({
      kind: "notice",
      message: "대화 위치로 이동하고 있습니다.",
    });
    expect(
      createChatRoomMessageNavigationFeedback({
        error: new Error("context failed"),
        isError: true,
        isPending: false,
        messages: [],
        targetMessageId: "message-01",
      }),
    ).toMatchObject({
      kind: "error",
      title: "대화 위치로 이동하지 못했습니다.",
    });
    expect(
      createChatRoomMessageNavigationFeedback({
        error: null,
        isError: false,
        isPending: false,
        messages: [{} as never],
        targetMessageId: "message-01",
      }),
    ).toBeNull();
  });
});
