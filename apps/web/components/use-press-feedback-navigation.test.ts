// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import type { MouseEvent, PointerEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LONG_PRESS_NAVIGATION_THRESHOLD_MS,
  PRESS_FEEDBACK_NAVIGATION_DELAY_MS,
  usePressFeedbackNavigation,
} from "./use-press-feedback-navigation";

const pushMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const CARD_RECT = { bottom: 220, left: 16, right: 377, top: 100 };

describe("usePressFeedbackNavigation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    pushMock.mockReset();
    stubTouchDevice(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("카드를 누르면 눌림 효과가 보이도록 잠깐 기다린 뒤 이동한다", () => {
    const { result } = renderHook(() => usePressFeedbackNavigation("/vote/task-a"));
    const event = createClickEvent();

    result.current.onClick(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(pushMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(PRESS_FEEDBACK_NAVIGATION_DELAY_MS);

    expect(pushMock).toHaveBeenCalledExactlyOnceWith("/vote/task-a");
  });

  it("기다리는 동안 다시 눌러도 한 번만 이동한다", () => {
    const { result } = renderHook(() => usePressFeedbackNavigation("/vote/task-a"));

    result.current.onClick(createClickEvent());
    result.current.onClick(createClickEvent());
    vi.advanceTimersByTime(PRESS_FEEDBACK_NAVIGATION_DELAY_MS);

    expect(pushMock).toHaveBeenCalledOnce();
  });

  it("마우스로 누르는 기기에서는 지연하지 않고 링크 기본 이동에 맡긴다", () => {
    stubTouchDevice(false);
    const { result } = renderHook(() => usePressFeedbackNavigation("/vote/task-a"));
    const event = createClickEvent();

    result.current.onClick(event);
    vi.advanceTimersByTime(PRESS_FEEDBACK_NAVIGATION_DELAY_MS);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("새 탭·새 창 열기는 막지 않고 브라우저에 맡긴다", () => {
    const { result } = renderHook(() => usePressFeedbackNavigation("/vote/task-a"));
    const modifiedClicks = [
      createClickEvent({ metaKey: true }),
      createClickEvent({ ctrlKey: true }),
      createClickEvent({ shiftKey: true }),
      createClickEvent({ button: 1 }),
    ];

    for (const event of modifiedClicks) result.current.onClick(event);
    vi.advanceTimersByTime(PRESS_FEEDBACK_NAVIGATION_DELAY_MS);

    for (const event of modifiedClicks) expect(event.preventDefault).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("길게 눌러 메뉴 대신 손을 카드 안에서 떼면 지연 없이 바로 이동한다", () => {
    const { result } = renderHook(() => usePressFeedbackNavigation("/chat/room-a"));
    const contextMenu = createClickEvent();

    result.current.onPointerDown(createPointerEvent({ timeStamp: 0 }));
    result.current.onContextMenu(contextMenu);
    result.current.onPointerUp(createPointerEvent({ timeStamp: 450 }));

    expect(contextMenu.preventDefault).toHaveBeenCalledOnce();
    expect(pushMock).toHaveBeenCalledExactlyOnceWith("/chat/room-a");
  });

  it("contextmenu가 오지 않아도 오래 누른 터치는 길게 누르기로 보고, 뒤늦은 click으로 한 번 더 이동하지 않는다", () => {
    const { result } = renderHook(() => usePressFeedbackNavigation("/chat/room-a"));
    const lateClick = createClickEvent();

    result.current.onPointerDown(createPointerEvent({ timeStamp: 0 }));
    result.current.onPointerUp(
      createPointerEvent({ timeStamp: LONG_PRESS_NAVIGATION_THRESHOLD_MS }),
    );
    result.current.onClick(lateClick);
    vi.advanceTimersByTime(PRESS_FEEDBACK_NAVIGATION_DELAY_MS);

    expect(lateClick.preventDefault).toHaveBeenCalledOnce();
    expect(pushMock).toHaveBeenCalledOnce();
  });

  it("길게 누른 채 손가락을 카드 밖으로 옮겨 떼거나 스크롤로 바뀌면 이동하지 않는다", () => {
    const { result } = renderHook(() => usePressFeedbackNavigation("/chat/room-a"));

    result.current.onPointerDown(createPointerEvent({ timeStamp: 0 }));
    result.current.onContextMenu(createClickEvent());
    result.current.onPointerUp(
      createPointerEvent({ clientY: CARD_RECT.bottom + 40, timeStamp: 600 }),
    );

    result.current.onPointerDown(createPointerEvent({ timeStamp: 1_000 }));
    result.current.onContextMenu(createClickEvent());
    result.current.onPointerCancel();
    result.current.onPointerUp(createPointerEvent({ timeStamp: 1_600 }));

    expect(pushMock).not.toHaveBeenCalled();
  });

  it("짧은 탭과 마우스 누르기는 손을 뗄 때 이동하지 않고 click에 맡긴다", () => {
    const { result } = renderHook(() => usePressFeedbackNavigation("/chat/room-a"));

    result.current.onPointerDown(createPointerEvent({ timeStamp: 0 }));
    result.current.onPointerUp(createPointerEvent({ timeStamp: 80 }));
    result.current.onPointerDown(createPointerEvent({ pointerType: "mouse", timeStamp: 1_000 }));
    result.current.onPointerUp(createPointerEvent({ pointerType: "mouse", timeStamp: 1_800 }));

    expect(pushMock).not.toHaveBeenCalled();
  });
});

function createClickEvent(
  patch: Partial<Pick<MouseEvent, "altKey" | "button" | "ctrlKey" | "metaKey" | "shiftKey">> = {},
): MouseEvent<HTMLAnchorElement> {
  return {
    altKey: false,
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    ...patch,
  } as unknown as MouseEvent<HTMLAnchorElement>;
}

function createPointerEvent(
  patch: Partial<Pick<PointerEvent, "clientX" | "clientY" | "pointerType" | "timeStamp">> = {},
): PointerEvent<HTMLAnchorElement> {
  return {
    clientX: 200,
    clientY: 160,
    currentTarget: { getBoundingClientRect: () => CARD_RECT },
    pointerType: "touch",
    timeStamp: 0,
    ...patch,
  } as unknown as PointerEvent<HTMLAnchorElement>;
}

function stubTouchDevice(matches: boolean): void {
  // jsdom에는 matchMedia가 없어 터치 기기 여부를 직접 정함
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches })),
  });
}
