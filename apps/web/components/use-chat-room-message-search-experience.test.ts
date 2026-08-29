import { describe, expect, it, vi } from "vitest";
import {
  closeChatRoomMessageSearchExperience,
  navigateFromChatRoomMessageSearch,
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

  it("검색 결과 메시지로 이동한 뒤 검색 panel을 닫는다", () => {
    const calls: string[] = [];

    navigateFromChatRoomMessageSearch({
      closeSearch: vi.fn(() => calls.push("close")),
      messageId: "message-01",
      onNavigateToMessage: vi.fn((messageId) => calls.push(`navigate:${messageId}`)),
    });

    expect(calls).toEqual(["navigate:message-01", "close"]);
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
