import { describe, expect, it } from "vitest";
import { getChatRoomUnreadBadgePresentation } from "./chat-room-unread-badge";

describe("chat room unread badge", () => {
  it("읽지 않은 메시지가 없으면 badge를 숨긴다", () => {
    expect(getChatRoomUnreadBadgePresentation(0, false)).toBeNull();
  });

  it("정확한 unread count와 capped count를 구분한다", () => {
    expect(getChatRoomUnreadBadgePresentation(200, false)).toEqual({
      ariaLabel: "읽지 않은 메시지 200개",
      text: "200",
    });
    expect(getChatRoomUnreadBadgePresentation(200, true)).toEqual({
      ariaLabel: "읽지 않은 메시지 200개 이상",
      text: "200+",
    });
  });

  it("유효하지 않은 unread count를 거절한다", () => {
    expect(() => getChatRoomUnreadBadgePresentation(-1, false)).toThrow(RangeError);
    expect(() => getChatRoomUnreadBadgePresentation(1.5, false)).toThrow(RangeError);
  });
});
