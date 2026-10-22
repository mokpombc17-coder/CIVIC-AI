// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  captureChatMessageViewportAnchor,
  findRenderedChatMessageAnchorElement,
} from "./chat-message-viewport-anchor";

describe("chat message viewport anchor", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("viewport 위로 벗어나지 않은 항목 중 가장 위 항목을 기준으로 잡는다", () => {
    const scrollElement = createScrollElement({ top: 100, viewportKey: "live" });
    appendItem(scrollElement, { renderKey: "m-01", top: 20, bottom: 90 });
    appendItem(scrollElement, { renderKey: "m-03", top: 180, bottom: 240 });
    appendItem(scrollElement, { renderKey: "m-02", top: 80, bottom: 150 });

    expect(captureChatMessageViewportAnchor(scrollElement)).toEqual({
      offsetFromViewportTop: -20,
      renderKey: "m-02",
      viewportKey: "live",
    });
  });

  it("날짜 구분선은 anchor 기준에서 제외한다", () => {
    const scrollElement = createScrollElement({ top: 0, viewportKey: "live" });
    appendItem(scrollElement, {
      dateKey: "2026-10-22",
      renderKey: "date-m-01",
      top: 0,
      bottom: 38,
    });
    appendItem(scrollElement, { renderKey: "m-01", top: 44, bottom: 120 });

    expect(captureChatMessageViewportAnchor(scrollElement)).toEqual({
      offsetFromViewportTop: 44,
      renderKey: "m-01",
      viewportKey: "live",
    });
  });

  it("보이는 항목이 없으면 anchor를 만들지 않는다", () => {
    const scrollElement = createScrollElement({ top: 100, viewportKey: "live" });
    appendItem(scrollElement, { renderKey: "m-01", top: 0, bottom: 100 });

    expect(captureChatMessageViewportAnchor(scrollElement)).toBeNull();
  });

  it("viewport key가 없으면 빈 key로 anchor를 만든다", () => {
    const scrollElement = createScrollElement({ top: 0 });
    appendItem(scrollElement, { renderKey: "m-01", top: 0, bottom: 76 });

    expect(captureChatMessageViewportAnchor(scrollElement)?.viewportKey).toBe("");
  });

  it("render key로 렌더링된 항목을 찾는다", () => {
    const scrollElement = createScrollElement({ top: 0, viewportKey: "live" });
    appendItem(scrollElement, {
      dateKey: "2026-10-22",
      renderKey: "date-m-01",
      top: 0,
      bottom: 38,
    });
    const target = appendItem(scrollElement, { renderKey: "m-01", top: 44, bottom: 120 });

    expect(findRenderedChatMessageAnchorElement(scrollElement, "m-01")).toBe(target);
    expect(findRenderedChatMessageAnchorElement(scrollElement, "date-m-01")?.dataset.dateKey).toBe(
      "2026-10-22",
    );
    expect(findRenderedChatMessageAnchorElement(scrollElement, "m-missing")).toBeNull();
  });
});

function createScrollElement({
  top,
  viewportKey,
}: {
  top: number;
  viewportKey?: string;
}): HTMLDivElement {
  const scrollElement = document.createElement("div");

  if (viewportKey !== undefined) {
    scrollElement.dataset.viewportKey = viewportKey;
  }

  stubBounds(scrollElement, { bottom: top + 400, top });
  document.body.append(scrollElement);
  return scrollElement;
}

function appendItem(
  scrollElement: HTMLDivElement,
  {
    bottom,
    dateKey,
    renderKey,
    top,
  }: {
    bottom: number;
    dateKey?: string;
    renderKey: string;
    top: number;
  },
): HTMLLIElement {
  const item = document.createElement("li");
  item.dataset.renderKey = renderKey;

  if (dateKey !== undefined) {
    item.dataset.dateKey = dateKey;
  }

  stubBounds(item, { bottom, top });
  scrollElement.append(item);
  return item;
}

function stubBounds(element: HTMLElement, { bottom, top }: { bottom: number; top: number }) {
  element.getBoundingClientRect = () =>
    DOMRect.fromRect({ height: bottom - top, width: 320, x: 0, y: top });
}
