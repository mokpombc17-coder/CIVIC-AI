// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMessageViewportAnchor } from "./chat-message-viewport-anchor";
import type { ChatMessageViewportItemViewModel } from "./chat-room-view-model";
import { useChatMessageViewportOlderHistory } from "./use-chat-message-viewport-older-history";

const VIEWPORT_KEY = "room-01:1";

type HookParams = Parameters<typeof useChatMessageViewportOlderHistory>[0];

describe("useChatMessageViewportOlderHistory", () => {
  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
  });

  it("이전 페이지를 기다리는 사이 목록이 바뀌어도 불러오기가 끝난 뒤에만 기준 위치를 복원한다", async () => {
    const olderPage = createDeferred<Readonly<{ hasOlderMessages: boolean }>>();
    const { dispatchPosition, params } = createParams({
      items: [createItem("m-02"), createItem("m-03")],
      onLoadOlder: () => olderPage.promise,
    });
    const { result, rerender } = renderHook(
      (props: HookParams) => useChatMessageViewportOlderHistory(props),
      { initialProps: params },
    );

    let loadOlder: Promise<void> | undefined;
    act(() => {
      loadOlder = result.current.loadOlderMessages();
    });

    // 응답 전에 실시간 메시지가 붙음
    rerender({ ...params, items: [createItem("m-02"), createItem("m-03"), createItem("m-04")] });
    expect(anchorRenderedCount(dispatchPosition)).toBe(0);

    // 이전 페이지가 붙고 응답 처리가 끝남
    rerender({
      ...params,
      items: [createItem("m-01"), createItem("m-02"), createItem("m-03"), createItem("m-04")],
    });
    await act(async () => {
      olderPage.resolve({ hasOlderMessages: true });
      await loadOlder;
    });

    expect(anchorRenderedCount(dispatchPosition)).toBe(1);
  });

  it("목록 쪽에서 이전 페이지를 받는 중이면 기준 위치 복원을 기다린다", async () => {
    const olderPage = createDeferred<Readonly<{ hasOlderMessages: boolean }>>();
    const { dispatchPosition, params } = createParams({
      items: [createItem("m-02"), createItem("m-03")],
      onLoadOlder: () => olderPage.promise,
    });
    const { result, rerender } = renderHook(
      (props: HookParams) => useChatMessageViewportOlderHistory(props),
      { initialProps: params },
    );

    let loadOlder: Promise<void> | undefined;
    act(() => {
      loadOlder = result.current.loadOlderMessages();
    });
    await act(async () => {
      olderPage.resolve({ hasOlderMessages: true });
      await loadOlder;
    });
    const countAfterResponse = anchorRenderedCount(dispatchPosition);

    rerender({
      ...params,
      isHistoryLoadingOlder: true,
      items: [createItem("m-02"), createItem("m-03"), createItem("m-04")],
    });
    expect(anchorRenderedCount(dispatchPosition)).toBe(countAfterResponse);

    rerender({
      ...params,
      isHistoryLoadingOlder: false,
      items: [createItem("m-01"), createItem("m-02"), createItem("m-03"), createItem("m-04")],
    });
    expect(anchorRenderedCount(dispatchPosition)).toBe(countAfterResponse + 1);
  });

  it("요청 중 같은 방에서 재연결돼 응답이 버려져도 다음 과거 이력을 다시 요청한다", async () => {
    const firstPage = createDeferred<Readonly<{ hasOlderMessages: boolean }>>();
    const onLoadOlder = vi
      .fn<HookParams["onLoadOlder"]>()
      .mockReturnValueOnce(firstPage.promise)
      .mockResolvedValueOnce({ hasOlderMessages: true });
    const { params } = createParams({
      items: [createItem("m-02"), createItem("m-03")],
      onLoadOlder,
    });
    const { result, rerender } = renderHook(
      (props: HookParams) => useChatMessageViewportOlderHistory(props),
      { initialProps: params },
    );

    let firstLoad: Promise<void> | undefined;
    act(() => {
      firstLoad = result.current.loadOlderMessages();
    });

    // 재연결로 generation이 바뀌었지만 같은 방이라 위치를 유지함
    const reconnectedViewportKey = "room-01:2";
    params.scrollElementRef.current!.dataset.viewportKey = reconnectedViewportKey;
    act(() => {
      result.current.handleViewportChanged({ preserved: true });
    });
    rerender({ ...params, viewportKey: reconnectedViewportKey });

    await act(async () => {
      firstPage.resolve({ hasOlderMessages: true });
      await firstLoad;
    });
    expect(result.current.isLoadingOlder).toBe(false);

    await act(async () => {
      await result.current.loadOlderMessages();
    });
    expect(onLoadOlder).toHaveBeenCalledTimes(2);
  });

  it("실패한 뒤에는 스크롤로 다시 요청하지 않고 다시 시도로만 요청한다", async () => {
    const onLoadOlder = vi
      .fn<HookParams["onLoadOlder"]>()
      .mockRejectedValueOnce(new Error("이전 메시지를 불러오지 못했습니다."))
      .mockResolvedValueOnce({ hasOlderMessages: true });
    const { params } = createParams({
      items: [createItem("m-02"), createItem("m-03")],
      onLoadOlder,
    });
    const { result } = renderHook(
      (props: HookParams) => useChatMessageViewportOlderHistory(props),
      { initialProps: params },
    );

    await act(async () => {
      await result.current.loadOlderMessages();
    });
    expect(result.current.loadError).toBe("이전 메시지를 불러오지 못했습니다.");

    await act(async () => {
      await result.current.loadOlderMessages();
    });
    expect(onLoadOlder).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.retryOlderMessages();
    });
    expect(onLoadOlder).toHaveBeenCalledTimes(2);
    expect(result.current.loadError).toBeNull();
  });

  it("실패한 뒤 같은 방에서 재연결되면 스크롤로 다시 요청할 수 있다", async () => {
    const onLoadOlder = vi
      .fn<HookParams["onLoadOlder"]>()
      .mockRejectedValueOnce(new Error("이전 메시지를 불러오지 못했습니다."))
      .mockResolvedValueOnce({ hasOlderMessages: true });
    const { params } = createParams({
      items: [createItem("m-02"), createItem("m-03")],
      onLoadOlder,
    });
    const { result, rerender } = renderHook(
      (props: HookParams) => useChatMessageViewportOlderHistory(props),
      { initialProps: params },
    );

    await act(async () => {
      await result.current.loadOlderMessages();
    });

    const reconnectedViewportKey = "room-01:2";
    params.scrollElementRef.current!.dataset.viewportKey = reconnectedViewportKey;
    act(() => {
      result.current.handleViewportChanged({ preserved: true });
    });
    rerender({ ...params, viewportKey: reconnectedViewportKey });
    expect(result.current.loadError).toBeNull();

    await act(async () => {
      await result.current.loadOlderMessages();
    });
    expect(onLoadOlder).toHaveBeenCalledTimes(2);
  });
});

function createParams({
  items,
  onLoadOlder,
}: Readonly<{
  items: readonly ChatMessageViewportItemViewModel[];
  onLoadOlder: HookParams["onLoadOlder"];
}>) {
  const dispatchPosition = vi.fn<HookParams["dispatchPosition"]>();
  const params: HookParams = {
    canLoadOlder: true,
    dispatchPosition,
    isHistoryLoadingOlder: false,
    items,
    onLoadOlder,
    pendingAnchorRef: { current: null as ChatMessageViewportAnchor | null },
    scrollElementRef: { current: createScrollElement("m-02") },
    viewportKey: VIEWPORT_KEY,
  };

  return { dispatchPosition, params };
}

function createItem(renderKey: string): ChatMessageViewportItemViewModel {
  return { kind: "read-boundary", afterSequence: 0, renderKey };
}

function anchorRenderedCount(dispatchPosition: ReturnType<typeof vi.fn>): number {
  return dispatchPosition.mock.calls.filter(([event]) => event.type === "older-anchor-rendered")
    .length;
}

function createScrollElement(anchorRenderKey: string): HTMLDivElement {
  const scrollElement = document.createElement("div");
  scrollElement.dataset.viewportKey = VIEWPORT_KEY;
  stubBounds(scrollElement, { bottom: 400, top: 0 });

  const item = document.createElement("li");
  item.dataset.renderKey = anchorRenderKey;
  stubBounds(item, { bottom: 80, top: 10 });
  scrollElement.append(item);

  document.body.append(scrollElement);
  return scrollElement;
}

function stubBounds(element: HTMLElement, { bottom, top }: { bottom: number; top: number }) {
  element.getBoundingClientRect = () =>
    DOMRect.fromRect({ height: bottom - top, width: 320, x: 0, y: top });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
