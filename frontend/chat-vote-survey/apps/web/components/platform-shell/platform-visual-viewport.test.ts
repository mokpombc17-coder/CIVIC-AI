import { describe, expect, it } from "vitest";
import {
  calculatePlatformVisibleHeight,
  calculatePlatformVisualViewportLayout,
  isPlatformTextEntry,
  shouldConstrainPlatformToVisualViewport,
} from "./platform-visual-viewport";

describe("calculatePlatformVisibleHeight", () => {
  it("reserves a bottom gap from the visual viewport height", () => {
    expect(
      calculatePlatformVisibleHeight({
        bottomGap: 16,
        viewportHeight: 800,
      }),
    ).toBe(784);
  });

  it("never returns a negative height", () => {
    expect(
      calculatePlatformVisibleHeight({
        bottomGap: 16,
        viewportHeight: 10,
      }),
    ).toBe(0);
  });
});

describe("calculatePlatformVisualViewportLayout", () => {
  it("visual viewport가 줄면 shell을 viewport 상단 offset에 맞춘다", () => {
    expect(
      calculatePlatformVisualViewportLayout({
        bottomGap: 0,
        viewportBaselineHeight: 852,
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
      calculatePlatformVisualViewportLayout({
        bottomGap: 0,
        viewportBaselineHeight: 852,
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

describe("shouldConstrainPlatformToVisualViewport", () => {
  it("입력 요소에 포커스가 없으면 viewport가 줄어도 공통 shell 높이를 유지한다", () => {
    expect(
      shouldConstrainPlatformToVisualViewport({
        hasFocusedTextEntry: false,
        viewportBaselineHeight: 852,
        viewportHeight: 480,
      }),
    ).toBe(false);
  });

  it("PWA의 작은 viewport 높이 차이는 키보드로 판단하지 않는다", () => {
    expect(
      shouldConstrainPlatformToVisualViewport({
        hasFocusedTextEntry: true,
        viewportBaselineHeight: 852,
        viewportHeight: 820,
      }),
    ).toBe(false);
  });

  it("입력 중 visual viewport가 충분히 줄면 키보드 보정을 적용한다", () => {
    expect(
      shouldConstrainPlatformToVisualViewport({
        hasFocusedTextEntry: true,
        viewportBaselineHeight: 852,
        viewportHeight: 480,
      }),
    ).toBe(true);
  });

  it("layout viewport도 함께 줄어드는 resize 모드에서 최초 높이를 기준으로 보정한다", () => {
    expect(
      shouldConstrainPlatformToVisualViewport({
        hasFocusedTextEntry: true,
        viewportBaselineHeight: 852,
        viewportHeight: 480,
      }),
    ).toBe(true);
  });
});

describe("isPlatformTextEntry", () => {
  it.each(["text", "search", "email", "password", "number"])(
    "%s input은 키보드를 여는 입력 요소로 판단한다",
    (inputType) => {
      expect(isPlatformTextEntry({ inputType, tagName: "INPUT" })).toBe(true);
    },
  );

  it("textarea와 contenteditable 요소를 입력 요소로 판단한다", () => {
    expect(isPlatformTextEntry({ tagName: "textarea" })).toBe(true);
    expect(isPlatformTextEntry({ contentEditable: true, tagName: "div" })).toBe(true);
  });

  it.each(["button", "checkbox", "file", "radio", "range"])(
    "%s input은 키보드 입력 요소로 판단하지 않는다",
    (inputType) => {
      expect(isPlatformTextEntry({ inputType, tagName: "input" })).toBe(false);
    },
  );

  it("disabled 또는 readOnly 입력은 키보드 입력 요소로 판단하지 않는다", () => {
    expect(isPlatformTextEntry({ disabled: true, tagName: "input" })).toBe(false);
    expect(isPlatformTextEntry({ readOnly: true, tagName: "textarea" })).toBe(false);
  });
});
