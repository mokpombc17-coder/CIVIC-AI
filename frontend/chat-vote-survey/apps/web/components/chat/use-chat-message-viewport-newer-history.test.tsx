// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatMessageViewportNewerHistory } from "./use-chat-message-viewport-newer-history";

type HookParams = Parameters<typeof useChatMessageViewportNewerHistory>[0];

describe("useChatMessageViewportNewerHistory", () => {
  afterEach(() => {
    cleanup();
  });

  it("실패한 뒤에는 스크롤로 다시 요청하지 않고 다시 시도로만 요청한다", async () => {
    const onLoadNewer = vi
      .fn<HookParams["onLoadNewer"]>()
      .mockRejectedValueOnce(new Error("다음 메시지를 불러오지 못했습니다."))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() =>
      useChatMessageViewportNewerHistory({
        canLoadNewer: true,
        onLoadNewer,
        viewportKey: "room-01:1:message-navigation:context:m-01",
      }),
    );

    await act(async () => {
      await result.current.loadNewerMessages();
    });
    expect(result.current.loadError).toBe("다음 메시지를 불러오지 못했습니다.");

    await act(async () => {
      await result.current.loadNewerMessages();
    });
    expect(onLoadNewer).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.retryNewerMessages();
    });
    expect(onLoadNewer).toHaveBeenCalledTimes(2);
    expect(result.current.loadError).toBeNull();
  });

  it("실패한 뒤 화면이 바뀌면 스크롤로 다시 요청할 수 있다", async () => {
    const onLoadNewer = vi
      .fn<HookParams["onLoadNewer"]>()
      .mockRejectedValueOnce(new Error("다음 메시지를 불러오지 못했습니다."))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() =>
      useChatMessageViewportNewerHistory({
        canLoadNewer: true,
        onLoadNewer,
        viewportKey: "room-01:1:message-navigation:context:m-01",
      }),
    );

    await act(async () => {
      await result.current.loadNewerMessages();
    });

    act(() => {
      result.current.handleViewportChanged();
    });
    expect(result.current.loadError).toBeNull();

    await act(async () => {
      await result.current.loadNewerMessages();
    });
    expect(onLoadNewer).toHaveBeenCalledTimes(2);
  });
});
