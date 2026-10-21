import { describe, expect, it } from "vitest";
import { shouldHoldChatRoomInitialEntry } from "./chat-room-initial-entry";

describe("shouldHoldChatRoomInitialEntry", () => {
  it("실시간 session과 최초 viewport 위치가 모두 준비될 때까지 진입 화면을 유지한다", () => {
    expect(
      shouldHoldChatRoomInitialEntry({
        hasRoomError: false,
        sessionKind: "pending",
        viewportPositioned: false,
      }),
    ).toBe(true);
    expect(
      shouldHoldChatRoomInitialEntry({
        hasRoomError: false,
        sessionKind: "active",
        viewportPositioned: false,
      }),
    ).toBe(true);
    expect(
      shouldHoldChatRoomInitialEntry({
        hasRoomError: false,
        sessionKind: "active",
        viewportPositioned: true,
      }),
    ).toBe(false);
  });

  it("오류나 읽기 전용 session은 viewport 준비를 기다리지 않는다", () => {
    expect(
      shouldHoldChatRoomInitialEntry({
        hasRoomError: true,
        sessionKind: "pending",
        viewportPositioned: false,
      }),
    ).toBe(false);
    expect(
      shouldHoldChatRoomInitialEntry({
        hasRoomError: false,
        sessionKind: "closed",
        viewportPositioned: false,
      }),
    ).toBe(false);
  });
});
