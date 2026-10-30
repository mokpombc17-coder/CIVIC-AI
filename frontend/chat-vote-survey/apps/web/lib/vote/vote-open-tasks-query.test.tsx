// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BRIDGE_VERSION,
  NATIVE_TO_WEB_EVENT,
  createBridgeId,
  serializeBridgeMessage,
} from "@repo/bridge";
import { useOpenTasksQuery } from "./vote-queries";

const openTasksHarness = vi.hoisted(() => ({
  getOpenTasks: vi.fn(async () => []),
}));

vi.mock("./vote-task-mock-api", () => ({
  createVoteTaskApiAdapter: () => ({ getOpenTasks: openTasksHarness.getOpenTasks }),
}));

describe("useOpenTasksQuery", () => {
  afterEach(() => {
    cleanup();
    openTasksHarness.getOpenTasks.mockClear();
    delete window.ReactNativeWebView;
  });

  it("앱이 백그라운드에서 돌아왔다고 알리면 진행 중 목록을 다시 조회한다", async () => {
    window.ReactNativeWebView = { postMessage: vi.fn() };
    renderOpenTasksQuery();
    await waitFor(() => expect(openTasksHarness.getOpenTasks).toHaveBeenCalledTimes(1));

    act(() => dispatchAppState("background"));
    act(() => dispatchAppState("active"));

    await waitFor(() => expect(openTasksHarness.getOpenTasks).toHaveBeenCalledTimes(2));
  });

  it("목록 조회가 꺼져 있으면 앱 복귀 신호로 조회하지 않는다", async () => {
    window.ReactNativeWebView = { postMessage: vi.fn() };
    renderOpenTasksQuery(false);

    act(() => dispatchAppState("active"));

    await Promise.resolve();
    expect(openTasksHarness.getOpenTasks).not.toHaveBeenCalled();
  });
});

function renderOpenTasksQuery(enabled = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return renderHook(() => useOpenTasksQuery(enabled), { wrapper });
}

function dispatchAppState(state: "active" | "background") {
  window.dispatchEvent(
    new CustomEvent(NATIVE_TO_WEB_EVENT, {
      detail: serializeBridgeMessage({
        version: BRIDGE_VERSION,
        id: createBridgeId("native"),
        sentAt: Date.now(),
        type: "APP_STATE_CHANGED",
        payload: { state },
      }),
    }),
  );
}
