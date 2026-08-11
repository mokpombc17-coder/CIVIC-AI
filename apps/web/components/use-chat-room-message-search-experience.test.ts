import { describe, expect, it, vi } from "vitest";
import {
  closeChatRoomMessageSearchExperience,
  shouldCloseChatRoomMessageSearchExperience,
} from "./use-chat-room-message-search-experience";

describe("ChatRoom message search experience", () => {
  it("context와 검색 세션을 정리한 뒤 dialog를 닫는다", () => {
    const calls: string[] = [];

    closeChatRoomMessageSearchExperience({
      clearSearch: vi.fn(() => calls.push("search")),
      closeContext: vi.fn(() => calls.push("context")),
      closeDialog: vi.fn(() => calls.push("dialog")),
    });

    expect(calls).toEqual(["context", "search", "dialog"]);
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
