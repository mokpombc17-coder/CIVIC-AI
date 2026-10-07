// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ParticipantSwipeNavigationController } from "./participant-swipe-navigation-controller";

describe("ParticipantSwipeNavigationController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    Object.defineProperties(HTMLElement.prototype, {
      hasPointerCapture: {
        configurable: true,
        value: vi.fn().mockReturnValue(true),
      },
      releasePointerCapture: {
        configurable: true,
        value: vi.fn(),
      },
      setPointerCapture: {
        configurable: true,
        value: vi.fn(),
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
    delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
    delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
    document.body.replaceChildren();
  });

  it("mount에서 touch 동작을 제한하고 unmount에서 기존 style과 listener를 복구한다", () => {
    const fixture = createNavigationFixture();
    fixture.content.style.touchAction = "manipulation";
    fixture.content.style.transform = "scale(1)";
    fixture.content.style.transition = "opacity 100ms linear";
    fixture.content.style.userSelect = "text";
    fixture.content.style.willChange = "opacity";
    const rendered = render(<ParticipantSwipeNavigationController currentPathname="/chat" />);

    expect(fixture.content.style.touchAction).toBe("pan-y pinch-zoom");
    dragHorizontally(fixture.content, { fromX: 180, toX: 80 });
    expect(fixture.content.dataset.platformSwipeState).toBe("dragging");

    rendered.unmount();

    expect(fixture.content.style).toMatchObject({
      touchAction: "manipulation",
      transform: "scale(1)",
      transition: "opacity 100ms linear",
      userSelect: "text",
      willChange: "opacity",
    });
    expect(fixture.content.dataset.platformSwipeState).toBeUndefined();

    dispatchPointer(fixture.content, "pointerdown", { clientX: 180, timeStamp: 300 });
    dispatchPointer(fixture.content, "pointermove", { clientX: 80, timeStamp: 350 });
    expect(fixture.content.style.transform).toBe("scale(1)");
  });

  it("mouse 입력은 무시하고 touch 가로 이동만 화면 transform에 반영한다", () => {
    const { content } = createNavigationFixture();
    render(<ParticipantSwipeNavigationController currentPathname="/chat" />);

    dispatchPointer(content, "pointerdown", {
      clientX: 180,
      pointerType: "mouse",
      timeStamp: 0,
    });
    const mouseMove = dispatchPointer(content, "pointermove", {
      clientX: 80,
      pointerType: "mouse",
      timeStamp: 50,
    });
    expect(mouseMove.defaultPrevented).toBe(false);
    expect(content.style.transform).toBe("");

    dispatchPointer(content, "pointerdown", { clientX: 180, timeStamp: 100 });
    const touchMove = dispatchPointer(content, "pointermove", {
      clientX: 80,
      timeStamp: 150,
    });

    expect(touchMove.defaultPrevented).toBe(true);
    expect(content.dataset.platformSwipeState).toBe("dragging");
    expect(content.style.transform).toMatch(/^translate3d\(-[\d.]+px, 0, 0\)$/);
    expect(content.style.transition).toBe("transform 70ms linear");
  });

  it("임계값보다 짧은 swipe는 원위치로 복귀하고 뒤따르는 click을 한 번 막는다", () => {
    const { content, voteLink } = createNavigationFixture();
    render(<ParticipantSwipeNavigationController currentPathname="/chat" />);
    const voteClick = vi.fn();
    voteLink.addEventListener("click", (event) => {
      event.preventDefault();
      voteClick();
    });

    dragHorizontally(content, { fromX: 180, toX: 130 });
    dispatchPointer(content, "pointerup", { clientX: 130, timeStamp: 200 });

    expect(content.dataset.platformSwipeState).toBe("cancelling");
    expect(content.style.transform).toBe("translate3d(0, 0, 0)");
    expect(content.style.transition).toBe("transform 180ms ease-out");

    const trailingClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    voteLink.dispatchEvent(trailingClick);
    expect(trailingClick.defaultPrevented).toBe(true);
    expect(voteClick).not.toHaveBeenCalled();

    const nextClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    voteLink.dispatchEvent(nextClick);
    expect(voteClick).toHaveBeenCalledOnce();

    act(() => {
      vi.advanceTimersByTime(230);
    });
    expect(content.dataset.platformSwipeState).toBeUndefined();
    expect(content.style.transform).toBe("");
  });

  it("임계값을 넘긴 왼쪽 swipe는 exit animation 후 /vote route를 click한다", () => {
    const { content, voteLink } = createNavigationFixture();
    vi.spyOn(content, "getBoundingClientRect").mockReturnValue({
      width: 320,
    } as DOMRect);
    const navigate = vi.spyOn(voteLink, "click").mockImplementation(() => undefined);
    render(<ParticipantSwipeNavigationController currentPathname="/chat" />);

    dragHorizontally(content, { fromX: 180, toX: 70 });
    dispatchPointer(content, "pointerup", { clientX: 70, timeStamp: 200 });

    expect(content.dataset.platformSwipeState).toBe("exiting");
    expect(content.style.transform).toBe("translate3d(-344px, 0, 0)");
    expect(navigate).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(navigate).not.toHaveBeenCalled();

    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(navigate).toHaveBeenCalledOnce();
  });

  it("blocking overlay가 열리면 진행 중인 swipe와 예약된 motion을 즉시 중단한다", async () => {
    const { content, shell } = createNavigationFixture();
    render(<ParticipantSwipeNavigationController currentPathname="/chat" />);

    dragHorizontally(content, { fromX: 180, toX: 70 });
    expect(content.dataset.platformSwipeState).toBe("dragging");

    const overlay = document.createElement("div");
    overlay.dataset.platformShellOverlay = "true";
    await act(async () => {
      shell.append(overlay);
      await Promise.resolve();
    });

    expect(content.dataset.platformSwipeState).toBeUndefined();
    expect(content.style.transform).toBe("");
    expect(content.style.transition).toBe("");

    dispatchPointer(content, "pointerup", { clientX: 70, timeStamp: 200 });
    expect(content.dataset.platformSwipeState).toBeUndefined();
  });

  it("unmount는 exit animation 뒤에 예약된 navigation까지 취소한다", () => {
    const { content, voteLink } = createNavigationFixture();
    vi.spyOn(content, "getBoundingClientRect").mockReturnValue({
      width: 320,
    } as DOMRect);
    const navigate = vi.spyOn(voteLink, "click").mockImplementation(() => undefined);
    const rendered = render(<ParticipantSwipeNavigationController currentPathname="/chat" />);

    dragHorizontally(content, { fromX: 180, toX: 70 });
    dispatchPointer(content, "pointerup", { clientX: 70, timeStamp: 200 });
    rendered.unmount();

    act(() => {
      vi.runAllTimers();
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(content.dataset.platformSwipeState).toBeUndefined();
    expect(content.style.transform).toBe("");
  });
});

function createNavigationFixture() {
  const shell = document.createElement("div");
  shell.dataset.platformShell = "true";
  const surface = document.createElement("div");
  surface.dataset.platformShellSurface = "true";
  const content = document.createElement("main");
  content.dataset.platformShellContent = "true";
  const navigation = document.createElement("nav");
  const chatLink = createNavigationLink("/chat", true);
  const voteLink = createNavigationLink("/vote");
  const ragLink = createNavigationLink("/rag");
  const mypageLink = createNavigationLink("/mypage");
  navigation.append(ragLink, chatLink, voteLink, mypageLink);
  surface.append(content, navigation);
  shell.append(surface);
  document.body.append(shell);

  return { chatLink, content, mypageLink, ragLink, shell, surface, voteLink };
}

function createNavigationLink(route: string, active = false): HTMLAnchorElement {
  const link = document.createElement("a");
  link.href = route;
  link.dataset.platformNavigationRoute = route;

  if (active) {
    link.setAttribute("aria-current", "page");
  }

  return link;
}

function dragHorizontally(
  target: HTMLElement,
  { fromX, toX }: Readonly<{ fromX: number; toX: number }>,
) {
  dispatchPointer(target, "pointerdown", { clientX: fromX, timeStamp: 0 });
  dispatchPointer(target, "pointermove", { clientX: toX, timeStamp: 50 });
}

function dispatchPointer(
  target: HTMLElement,
  type: "pointercancel" | "pointerdown" | "pointermove" | "pointerup",
  {
    clientX,
    clientY = 0,
    pointerId = 1,
    pointerType = "touch",
    timeStamp,
  }: Readonly<{
    clientX: number;
    clientY?: number;
    pointerId?: number;
    pointerType?: string;
    timeStamp: number;
  }>,
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: 0 },
    clientX: { value: clientX },
    clientY: { value: clientY },
    isPrimary: { value: true },
    pointerId: { value: pointerId },
    pointerType: { value: pointerType },
    timeStamp: { value: timeStamp },
  });
  fireEvent(target, event);
  return event;
}
