// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { isChatMessageViewportScrollKey } from "./chat-message-viewport-user-input";

describe("chat message viewport user input", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("목록에서 스크롤을 일으키는 키만 사용자 스크롤로 본다", () => {
    const list = document.createElement("div");

    for (const key of ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]) {
      expect(isChatMessageViewportScrollKey(key, list)).toBe(true);
    }

    for (const key of ["Enter", "Tab", "Escape", "a"]) {
      expect(isChatMessageViewportScrollKey(key, list)).toBe(false);
    }
  });

  it("입력 요소 안의 키는 사용자 스크롤로 보지 않는다", () => {
    const input = document.createElement("input");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    document.body.append(input, editable);

    expect(isChatMessageViewportScrollKey("ArrowUp", input)).toBe(false);
    expect(isChatMessageViewportScrollKey(" ", input)).toBe(false);
    expect(isChatMessageViewportScrollKey("PageDown", editable)).toBe(false);
  });

  it("버튼에 focus가 있으면 Space만 제외하고 방향키는 사용자 스크롤로 본다", () => {
    const button = document.createElement("button");
    const icon = document.createElement("span");
    button.append(icon);
    document.body.append(button);

    expect(isChatMessageViewportScrollKey(" ", button)).toBe(false);
    expect(isChatMessageViewportScrollKey(" ", icon)).toBe(false);
    expect(isChatMessageViewportScrollKey("ArrowDown", button)).toBe(true);
  });

  it("대상 요소를 알 수 없으면 키만으로 판단한다", () => {
    expect(isChatMessageViewportScrollKey("End", null)).toBe(true);
    expect(isChatMessageViewportScrollKey("Enter", null)).toBe(false);
  });
});
