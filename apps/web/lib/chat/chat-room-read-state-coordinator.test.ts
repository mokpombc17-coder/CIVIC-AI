import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChatRoomReadStateContractError,
  ChatRoomReadStateCoordinator,
} from "./chat-room-read-state-coordinator";

describe("ChatRoomReadStateCoordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("같은 방의 예약 sequence를 최댓값으로 병합한다", async () => {
    const submit = vi.fn(async (_roomId: string, throughSequence: number) => throughSequence);
    const coordinator = new ChatRoomReadStateCoordinator({ submit });

    coordinator.schedule("room-a", 10);
    coordinator.schedule("room-a", 13);
    coordinator.schedule("room-a", 12);

    await vi.advanceTimersByTimeAsync(400);

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith("room-a", 13);
    expect(coordinator.getRoomSnapshot("room-a")).toMatchObject({
      confirmedSequence: 13,
      inFlightSequence: null,
      pendingSequence: null,
      status: "idle",
    });
  });

  it("요청 중 더 높은 sequence가 예약되면 현재 요청 성공 후 순서대로 전송한다", async () => {
    const firstSubmission = createDeferred<number>();
    const secondSubmission = createDeferred<number>();
    const submit = vi
      .fn<(roomId: string, throughSequence: number) => Promise<number>>()
      .mockReturnValueOnce(firstSubmission.promise)
      .mockReturnValueOnce(secondSubmission.promise);
    const coordinator = new ChatRoomReadStateCoordinator({ submit });

    coordinator.schedule("room-a", 13);
    await vi.advanceTimersByTimeAsync(400);
    coordinator.schedule("room-a", 15);
    coordinator.schedule("room-a", 12);

    expect(submit).toHaveBeenCalledTimes(1);
    expect(coordinator.getRoomSnapshot("room-a")).toMatchObject({
      inFlightSequence: 13,
      pendingSequence: 15,
      status: "pending",
    });

    firstSubmission.resolve(13);
    await flushMicrotasks();

    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit).toHaveBeenLastCalledWith("room-a", 15);

    secondSubmission.resolve(15);
    await flushMicrotasks();

    expect(coordinator.getRoomSnapshot("room-a")).toMatchObject({
      confirmedSequence: 15,
      inFlightSequence: null,
      pendingSequence: null,
      status: "idle",
    });
  });

  it("최종 실패한 sequence를 pending으로 복원하고 lifecycle retry에서 다시 전송한다", async () => {
    const submit = vi
      .fn<(roomId: string, throughSequence: number) => Promise<number>>()
      .mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockResolvedValueOnce(13);
    const coordinator = new ChatRoomReadStateCoordinator({ submit });

    coordinator.schedule("room-a", 13);
    await vi.advanceTimersByTimeAsync(400);

    expect(coordinator.getRoomSnapshot("room-a")).toMatchObject({
      confirmedSequence: 0,
      inFlightSequence: null,
      pendingSequence: 13,
      retryAttempt: 1,
      status: "pending",
    });

    coordinator.retryPending("room-a");
    await flushMicrotasks();

    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit).toHaveBeenLastCalledWith("room-a", 13);
    expect(coordinator.getRoomSnapshot("room-a")).toMatchObject({
      confirmedSequence: 13,
      pendingSequence: null,
      retryAttempt: 0,
      status: "idle",
    });
  });

  it("서로 다른 방의 요청은 독립적으로 처리한다", async () => {
    const roomASubmission = createDeferred<number>();
    const roomBSubmission = createDeferred<number>();
    const submit = vi.fn((roomId: string) =>
      roomId === "room-a" ? roomASubmission.promise : roomBSubmission.promise,
    );
    const coordinator = new ChatRoomReadStateCoordinator({ submit });

    coordinator.schedule("room-a", 10);
    coordinator.schedule("room-b", 20);
    await vi.advanceTimersByTimeAsync(400);

    expect(submit).toHaveBeenCalledTimes(2);
    expect(coordinator.getRoomSnapshot("room-a")?.inFlightSequence).toBe(10);
    expect(coordinator.getRoomSnapshot("room-b")?.inFlightSequence).toBe(20);

    roomASubmission.resolve(10);
    roomBSubmission.resolve(20);
    await flushMicrotasks();

    expect(coordinator.getRoomSnapshot("room-a")?.confirmedSequence).toBe(10);
    expect(coordinator.getRoomSnapshot("room-b")?.confirmedSequence).toBe(20);
  });

  it("확정된 sequence 이하의 예약은 새로운 요청을 만들지 않는다", async () => {
    const submit = vi.fn(async (_roomId: string, throughSequence: number) => throughSequence);
    const coordinator = new ChatRoomReadStateCoordinator({ submit });

    coordinator.schedule("room-a", 15);
    await vi.advanceTimersByTimeAsync(400);
    coordinator.schedule("room-a", 12);
    coordinator.schedule("room-a", 15);
    await vi.advanceTimersByTimeAsync(1_500);

    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("제출값보다 낮은 서버 응답을 blocked 계약 오류로 보존한다", async () => {
    const coordinator = new ChatRoomReadStateCoordinator({
      submit: vi.fn(async () => 12),
    });

    coordinator.schedule("room-a", 13);
    await vi.advanceTimersByTimeAsync(400);

    const snapshot = coordinator.getRoomSnapshot("room-a");
    expect(snapshot).toMatchObject({
      confirmedSequence: 0,
      inFlightSequence: null,
      pendingSequence: 13,
      status: "blocked",
    });
    expect(snapshot?.lastError).toBeInstanceOf(ChatRoomReadStateContractError);

    coordinator.retryPending("room-a");
    expect(coordinator.getRoomSnapshot("room-a")?.status).toBe("blocked");
  });
});

function createDeferred<T>(): {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
