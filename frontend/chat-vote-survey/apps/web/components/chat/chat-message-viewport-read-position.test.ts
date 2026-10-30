// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { findChatMessageViewportReadThroughSequence } from "./chat-message-viewport-read-position";

describe("chat message viewport read position", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("본문 마지막 줄이 화면에 보이거나 위로 지나간 메시지 중 가장 아래 순번을 읽음 위치로 본다", () => {
    const scrollElement = createScrollElement({ bottom: 400, top: 0 });
    appendMessage(scrollElement, { bodyBottom: -20, bodyTop: -80, roomSequence: 10 });
    appendMessage(scrollElement, { bodyBottom: 300, bodyTop: 220, roomSequence: 11 });
    appendMessage(scrollElement, { bodyBottom: 460, bodyTop: 380, roomSequence: 12 });

    expect(findChatMessageViewportReadThroughSequence(scrollElement)).toBe(11);
  });

  it("행 아래 여백이 화면 밖이어도 본문 마지막 줄이 보이면 읽음으로 본다", () => {
    const scrollElement = createScrollElement({ bottom: 400, top: 0 });
    appendMessage(scrollElement, {
      bodyBottom: 390,
      bodyTop: 320,
      roomSequence: 20,
      rowBottom: 404,
    });

    expect(findChatMessageViewportReadThroughSequence(scrollElement)).toBe(20);
  });

  it("화면보다 긴 메시지는 본문 마지막 줄이 보일 때 읽음으로 본다", () => {
    const scrollElement = createScrollElement({ bottom: 400, top: 0 });
    appendMessage(scrollElement, { bodyBottom: 0, bodyTop: -60, roomSequence: 30 });
    appendMessage(scrollElement, { bodyBottom: 900, bodyTop: 10, roomSequence: 31 });

    expect(findChatMessageViewportReadThroughSequence(scrollElement)).toBe(30);

    appendMessage(scrollElement, { bodyBottom: 399.5, bodyTop: -500, roomSequence: 32 });
    expect(findChatMessageViewportReadThroughSequence(scrollElement)).toBe(32);
  });

  it("경계에 1px 미만으로 걸친 메시지도 읽음으로 본다", () => {
    const scrollElement = createScrollElement({ bottom: 400, top: 0 });
    appendMessage(scrollElement, { bodyBottom: 400.6, bodyTop: 320, roomSequence: 40 });

    expect(findChatMessageViewportReadThroughSequence(scrollElement)).toBe(40);
  });

  it("순번이 없는 항목과 본문 마지막 줄이 보이지 않는 메시지만 있으면 읽음 위치가 없다", () => {
    const scrollElement = createScrollElement({ bottom: 400, top: 0 });
    const pending = document.createElement("li");
    stubBounds(pending, { bottom: 100, top: 20 });
    scrollElement.append(pending);
    appendMessage(scrollElement, { bodyBottom: 520, bodyTop: 360, roomSequence: 50 });

    expect(findChatMessageViewportReadThroughSequence(scrollElement)).toBeNull();
  });
});

function createScrollElement(bounds: { bottom: number; top: number }): HTMLDivElement {
  const scrollElement = document.createElement("div");
  stubBounds(scrollElement, bounds);
  document.body.append(scrollElement);
  return scrollElement;
}

function appendMessage(
  scrollElement: HTMLDivElement,
  {
    bodyBottom,
    bodyTop,
    roomSequence,
    rowBottom = bodyBottom,
  }: { bodyBottom: number; bodyTop: number; roomSequence: number; rowBottom?: number },
): void {
  const row = document.createElement("li");
  row.dataset.roomSequence = String(roomSequence);
  stubBounds(row, { bottom: rowBottom, top: bodyTop });

  const body = document.createElement("p");
  body.dataset.messageBubble = "true";
  stubBounds(body, { bottom: bodyBottom, top: bodyTop });

  row.append(body);
  scrollElement.append(row);
}

function stubBounds(element: HTMLElement, { bottom, top }: { bottom: number; top: number }) {
  element.getBoundingClientRect = () =>
    DOMRect.fromRect({ height: bottom - top, width: 320, x: 0, y: top });
}
