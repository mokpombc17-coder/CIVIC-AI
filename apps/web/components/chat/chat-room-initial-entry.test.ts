import { describe, expect, it } from "vitest";
import { shouldHoldChatRoomInitialEntry } from "./chat-room-initial-entry";

describe("shouldHoldChatRoomInitialEntry", () => {
  it("실시간 session과 최초 viewport 위치가 모두 준비될 때까지 진입 화면을 유지한다", () => {
    expect(
      shouldHoldChatRoomInitialEntry({
        entryNavigationNeedsAction: false,
        hasRoomError: false,
        sessionKind: "pending",
        viewportPositioned: false,
      }),
    ).toBe(true);
    expect(
      shouldHoldChatRoomInitialEntry({
        entryNavigationNeedsAction: false,
        hasRoomError: false,
        sessionKind: "active",
        viewportPositioned: false,
      }),
    ).toBe(true);
    expect(
      shouldHoldChatRoomInitialEntry({
        entryNavigationNeedsAction: false,
        hasRoomError: false,
        sessionKind: "active",
        viewportPositioned: true,
      }),
    ).toBe(false);
  });

  it("오류나 읽기 전용 session은 viewport 준비를 기다리지 않는다", () => {
    expect(
      shouldHoldChatRoomInitialEntry({
        entryNavigationNeedsAction: false,
        hasRoomError: true,
        sessionKind: "pending",
        viewportPositioned: false,
      }),
    ).toBe(false);
    expect(
      shouldHoldChatRoomInitialEntry({
        entryNavigationNeedsAction: false,
        hasRoomError: false,
        sessionKind: "closed",
        viewportPositioned: false,
      }),
    ).toBe(false);
  });

  it("읽은 위치 찾기가 사용자 조작을 기다리면 viewport 준비를 기다리지 않는다", () => {
    expect(
      shouldHoldChatRoomInitialEntry({
        entryNavigationNeedsAction: true,
        hasRoomError: false,
        sessionKind: "active",
        viewportPositioned: false,
      }),
    ).toBe(false);
  });
});
