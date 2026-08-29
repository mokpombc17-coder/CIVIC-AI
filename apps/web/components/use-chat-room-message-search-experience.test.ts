import { describe, expect, it, vi } from "vitest";
import {
  closeChatRoomMessageSearchExperience,
  createChatRoomMessageSearchNavigationState,
  shouldCloseChatRoomMessageSearchExperience,
} from "./use-chat-room-message-search-experience";

describe("ChatRoom message search experience", () => {
  it("검색 세션을 정리한 뒤 dialog를 닫는다", () => {
    const calls: string[] = [];

    closeChatRoomMessageSearchExperience({
      clearSearch: vi.fn(() => calls.push("search")),
      closeDialog: vi.fn(() => calls.push("dialog")),
    });

    expect(calls).toEqual(["search", "dialog"]);
  });

  it("가장 최신 결과에서는 더 오래된 결과로만 이동할 수 있다", () => {
    expect(
      createChatRoomMessageSearchNavigationState({
        currentResultMessageId: "message-03",
        hasNextPage: false,
        isError: false,
        messages: [
          { messageId: "message-03" },
          { messageId: "message-02" },
          { messageId: "message-01" },
        ],
      }),
    ).toEqual({
      canNavigateNewer: false,
      canNavigateOlder: true,
      currentResultIndex: 0,
    });
  });

  it("불러온 가장 오래된 결과에서는 다음 cursor가 있을 때만 위 이동을 허용한다", () => {
    const messages = [{ messageId: "message-02" }, { messageId: "message-01" }];

    expect(
      createChatRoomMessageSearchNavigationState({
        currentResultMessageId: "message-01",
        hasNextPage: true,
        isError: false,
        messages,
      }),
    ).toEqual({
      canNavigateNewer: true,
      canNavigateOlder: true,
      currentResultIndex: 1,
    });
    expect(
      createChatRoomMessageSearchNavigationState({
        currentResultMessageId: "message-01",
        hasNextPage: false,
        isError: false,
        messages,
      }),
    ).toEqual({
      canNavigateNewer: true,
      canNavigateOlder: false,
      currentResultIndex: 1,
    });
  });

  it("현재 결과가 누적 결과에서 사라지면 선택되지 않은 상태로 복구한다", () => {
    expect(
      createChatRoomMessageSearchNavigationState({
        currentResultMessageId: "message-missing",
        hasNextPage: true,
        isError: false,
        messages: [{ messageId: "message-01" }],
      }),
    ).toEqual({
      canNavigateNewer: false,
      canNavigateOlder: false,
      currentResultIndex: null,
    });
  });

  it.each([
    { expected: true, isOpen: true, roomActive: false },
    { expected: false, isOpen: false, roomActive: false },
    { expected: false, isOpen: true, roomActive: true },
    { expected: false, isOpen: false, roomActive: true },
  ])(
    "열림=$isOpen 활성=$roomActive이면 자동 종료 여부는 $expected다",
    ({ expected, isOpen, roomActive }) => {
      expect(shouldCloseChatRoomMessageSearchExperience(isOpen, roomActive)).toBe(expected);
    },
  );
});
