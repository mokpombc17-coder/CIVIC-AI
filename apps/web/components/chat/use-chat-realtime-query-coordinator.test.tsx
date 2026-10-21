// @vitest-environment jsdom

import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApplyChatRealtimeDeliveryResult,
  ChatRealtimeQueryCoordinatorOptions,
} from "@/lib/chat/realtime/chat-realtime-query-coordinator";
import { useChatRealtimeQueryCoordinator } from "./use-chat-realtime-query-coordinator";

type MockCoordinator = Readonly<{
  notifyRoomSnapshotApplied: ReturnType<typeof vi.fn>;
  options: ChatRealtimeQueryCoordinatorOptions;
  queryClient: unknown;
  retryPendingDelivery: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  transport: unknown;
}>;

type HookParams = Readonly<{
  enabled: boolean;
  generation: number;
  limit?: number;
  messageVisibleAfterSequence: number;
  roomId: string;
  watermarkSequence: number;
}>;

const coordinatorHarness = vi.hoisted(() => ({
  instances: [] as MockCoordinator[],
  notifyError: null as Error | null,
}));

const transportHarness = vi.hoisted(() => ({
  transport: {
    acknowledgeRealtimeEventDelivery: vi.fn(),
    getRealtimeEventDelivery: vi.fn(),
    markRoomSnapshotApplied: vi.fn(),
    observeRealtimeEventDelivery: vi.fn(),
  },
}));

vi.mock("@/lib/chat/realtime/chat-realtime-query-coordinator", () => ({
  ChatRealtimeQueryCoordinator: class MockChatRealtimeQueryCoordinator {
    readonly notifyRoomSnapshotApplied = vi.fn(() => {
      if (coordinatorHarness.notifyError) {
        throw coordinatorHarness.notifyError;
      }
    });
    readonly retryPendingDelivery = vi.fn();
    readonly start = vi.fn();
    readonly stop = vi.fn();

    constructor(
      readonly queryClient: unknown,
      readonly transport: unknown,
      readonly options: ChatRealtimeQueryCoordinatorOptions,
    ) {
      coordinatorHarness.instances.push(this);
    }
  },
}));

vi.mock("./chat-realtime-provider", () => ({
  useChatRealtimeTransport: () => transportHarness.transport,
}));

const DELIVERY_RESULT: ApplyChatRealtimeDeliveryResult = {
  deliveryId: "delivery-01",
  messageCount: 2,
  messageMerge: {
    gaps: [],
    lastContiguousSequence: null,
    messages: [],
  },
  readReceiptEventCount: 1,
  roomEventCount: 1,
};

const DEFAULT_PARAMS = {
  enabled: true,
  generation: 3,
  limit: 30,
  messageVisibleAfterSequence: 10,
  roomId: "room-01",
  watermarkSequence: 20,
} satisfies HookParams;

describe("useChatRealtimeQueryCoordinator", () => {
  beforeEach(() => {
    coordinatorHarness.instances.length = 0;
    coordinatorHarness.notifyError = null;
    for (const mock of Object.values(transportHarness.transport)) {
      mock.mockReset();
    }
  });

  afterEach(() => {
    cleanup();
  });

  it("활성화 시 현재 room 세대의 coordinator를 시작하고 unmount에서 정리한다", async () => {
    const rendered = renderCoordinatorHook(DEFAULT_PARAMS);
    await flushStateUpdates();

    const coordinator = getCoordinator();
    expect(coordinator.queryClient).toBe(rendered.queryClient);
    expect(coordinator.transport).toBe(transportHarness.transport);
    expect(coordinator.options).toMatchObject({
      generation: 3,
      limit: 30,
      messageVisibleAfterSequence: 10,
      roomId: "room-01",
      watermarkSequence: 20,
    });
    expect(coordinator.start).toHaveBeenCalledOnce();
    expect(coordinator.notifyRoomSnapshotApplied).toHaveBeenCalledOnce();

    rendered.unmount();

    expect(coordinator.stop).toHaveBeenCalledOnce();
  });

  it("core coordinator callback을 동일한 화면 상태 전이로 연결한다", async () => {
    const { result } = renderCoordinatorHook(DEFAULT_PARAMS);
    await flushStateUpdates();
    const { options } = getCoordinator();

    await emitCoordinatorCallback(() => options.onSynchronized?.());
    expect(result.current.isSynchronized).toBe(true);

    await emitCoordinatorCallback(() => options.onSnapshotRefreshStarted?.());
    expect(result.current).toMatchObject({
      error: null,
      isRecovering: true,
      isSynchronized: false,
    });

    await emitCoordinatorCallback(() => options.onRecovered?.({} as never));
    expect(result.current).toMatchObject({
      isRecovering: false,
      isSynchronized: false,
    });

    await emitCoordinatorCallback(() => options.onApplied?.(DELIVERY_RESULT));
    expect(result.current).toMatchObject({
      error: null,
      isRecovering: false,
      isSynchronized: true,
      lastApplied: DELIVERY_RESULT,
    });

    const error = new Error("merge failed");
    await emitCoordinatorCallback(() => options.onError?.(error));
    expect(result.current).toMatchObject({
      error,
      isRecovering: false,
      isSynchronized: false,
      lastApplied: DELIVERY_RESULT,
    });
  });

  it("read receipt callback을 core coordinator 상태와 독립적으로 반영한다", async () => {
    const { result } = renderCoordinatorHook(DEFAULT_PARAMS);
    await flushStateUpdates();
    const { options } = getCoordinator();
    const error = new Error("receipt failed");

    await emitCoordinatorCallback(() => options.onSynchronized?.());
    await emitCoordinatorCallback(() =>
      options.readReceipt?.onStateChange?.({
        error,
        generation: DEFAULT_PARAMS.generation,
        roomId: DEFAULT_PARAMS.roomId,
        status: "error",
      }),
    );

    expect(result.current).toMatchObject({
      error: null,
      isSynchronized: true,
      readReceiptError: error,
      readReceiptStatus: "error",
    });

    await emitCoordinatorCallback(() => options.readReceipt?.onError?.("unknown failure"));
    expect(result.current.readReceiptError).toEqual(
      new Error("실시간 채팅 cache 병합 중 알 수 없는 오류가 발생했습니다."),
    );
    expect(result.current.error).toBeNull();
  });

  it("재시도는 오류만 지우고 현재 coordinator에 pending delivery 재시도를 요청한다", async () => {
    const { result } = renderCoordinatorHook(DEFAULT_PARAMS);
    await flushStateUpdates();
    const coordinator = getCoordinator();
    const error = new Error("merge failed");
    const receiptError = new Error("receipt failed");

    await emitCoordinatorCallback(() => coordinator.options.onApplied?.(DELIVERY_RESULT));
    await emitCoordinatorCallback(() => coordinator.options.onError?.(error));
    await emitCoordinatorCallback(() => coordinator.options.readReceipt?.onError?.(receiptError));

    act(() => {
      result.current.retry();
    });

    expect(coordinator.retryPendingDelivery).toHaveBeenCalledOnce();
    expect(result.current).toMatchObject({
      error: null,
      isSynchronized: false,
      lastApplied: DELIVERY_RESULT,
      readReceiptError: null,
    });
  });

  it("비활성화 시 coordinator를 정리하고 receipt 상태를 가리며 retry를 무시한다", async () => {
    const rendered = renderCoordinatorHook(DEFAULT_PARAMS);
    await flushStateUpdates();
    const coordinator = getCoordinator();

    await emitCoordinatorCallback(() =>
      coordinator.options.readReceipt?.onStateChange?.({
        error: new Error("receipt failed"),
        generation: DEFAULT_PARAMS.generation,
        roomId: DEFAULT_PARAMS.roomId,
        status: "error",
      }),
    );

    rendered.rerender({ ...DEFAULT_PARAMS, enabled: false });

    expect(coordinator.stop).toHaveBeenCalledOnce();
    expect(coordinatorHarness.instances).toHaveLength(1);
    expect(rendered.result.current).toMatchObject({
      readReceiptError: null,
      readReceiptStatus: "idle",
    });

    act(() => {
      rendered.result.current.retry();
    });

    expect(coordinator.retryPendingDelivery).not.toHaveBeenCalled();
  });

  it("세대 교체 후 이전 coordinator의 늦은 callback을 무시한다", async () => {
    const rendered = renderCoordinatorHook(DEFAULT_PARAMS);
    await flushStateUpdates();
    const previous = getCoordinator();

    previous.options.onError?.(new Error("stale failure"));
    rendered.rerender({ ...DEFAULT_PARAMS, generation: 4 });
    await flushStateUpdates();

    const current = getCoordinator(1);
    expect(previous.stop).toHaveBeenCalledOnce();
    expect(current.start).toHaveBeenCalledOnce();
    expect(rendered.result.current.error).toBeNull();

    await emitCoordinatorCallback(() => previous.options.onError?.(new Error("late failure")));
    expect(rendered.result.current.error).toBeNull();

    const currentError = new Error("current failure");
    await emitCoordinatorCallback(() => current.options.onError?.(currentError));
    expect(rendered.result.current.error).toBe(currentError);
  });

  it("초기 snapshot 적용 오류를 coordinator 오류 상태로 변환한다", async () => {
    const error = new Error("snapshot not ready");
    coordinatorHarness.notifyError = error;

    const { result } = renderCoordinatorHook(DEFAULT_PARAMS);
    await flushStateUpdates();

    expect(result.current).toMatchObject({
      error,
      isRecovering: false,
      isSynchronized: false,
    });
  });
});

function renderCoordinatorHook(initialProps: HookParams) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook((params: HookParams) => useChatRealtimeQueryCoordinator(params), {
    initialProps,
    wrapper,
  });

  return { ...rendered, queryClient };
}

function getCoordinator(index = 0): MockCoordinator {
  const coordinator = coordinatorHarness.instances[index];

  if (!coordinator) {
    throw new Error(`coordinator ${index}가 생성되지 않았습니다.`);
  }

  return coordinator;
}

async function emitCoordinatorCallback(callback: () => void): Promise<void> {
  await act(async () => {
    callback();
    await Promise.resolve();
  });
}

async function flushStateUpdates(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}
