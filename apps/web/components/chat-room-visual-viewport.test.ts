import { describe, expect, it } from "vitest";
import {
  calculateChatRoomVisibleHeight,
  calculateChatRoomVisualViewportLayout,
  shouldConstrainChatRoomToVisualViewport,
} from "./chat-room-visual-viewport";

describe("calculateChatRoomVisibleHeight", () => {
  it("reserves a bottom gap from the visual viewport height", () => {
    expect(
      calculateChatRoomVisibleHeight({
        bottomGap: 16,
        viewportHeight: 800,
      }),
    ).toBe(784);
  });

  it("never returns a negative height", () => {
    expect(
      calculateChatRoomVisibleHeight({
        bottomGap: 16,
        viewportHeight: 10,
      }),
    ).toBe(0);
  });
});

describe("calculateChatRoomVisualViewportLayout", () => {
  it("visual viewport가 줄면 shell을 viewport 상단 offset에 맞춘다", () => {
    expect(
      calculateChatRoomVisualViewportLayout({
        bottomGap: 0,
        layoutViewportHeight: 852,
        viewportHeight: 480.8,
        viewportOffsetTop: 22.9,
      }),
    ).toEqual({
      alignSelf: "start",
      height: 480,
      marginTop: "22px",
    });
  });

  it("visual viewport가 줄지 않으면 공통 shell 정렬을 유지한다", () => {
    expect(
      calculateChatRoomVisualViewportLayout({
        bottomGap: 0,
        layoutViewportHeight: 852,
        viewportHeight: 852,
        viewportOffsetTop: 0,
      }),
    ).toEqual({
      alignSelf: "",
      height: 852,
      marginTop: "",
    });
  });
});

describe("shouldConstrainChatRoomToVisualViewport", () => {
  it("입력 요소에 포커스가 없으면 viewport가 줄어도 공통 shell 높이를 유지한다", () => {
    expect(
      shouldConstrainChatRoomToVisualViewport({
        hasFocusedTextEntry: false,
        layoutViewportHeight: 852,
        viewportHeight: 480,
        viewportOffsetTop: 0,
      }),
    ).toBe(false);
  });

  it("PWA의 작은 viewport 높이 차이는 키보드로 판단하지 않는다", () => {
    expect(
      shouldConstrainChatRoomToVisualViewport({
        hasFocusedTextEntry: true,
        layoutViewportHeight: 852,
        viewportHeight: 820,
        viewportOffsetTop: 0,
      }),
    ).toBe(false);
  });

  it("입력 중 visual viewport가 충분히 줄면 키보드 보정을 적용한다", () => {
    expect(
      shouldConstrainChatRoomToVisualViewport({
        hasFocusedTextEntry: true,
        layoutViewportHeight: 852,
        viewportHeight: 480,
        viewportOffsetTop: 22,
      }),
    ).toBe(true);
  });
});
