import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatRoomReadStateScheduler } from "./chat-room-read-state-scheduler";

describe("ChatRoomReadStateScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("연속 sequence에서 가장 큰 값만 debounce 후 전송한다", async () => {
    vi.useFakeTimers();
    const submit = vi.fn(async (throughSequence: number) => throughSequence);
    const scheduler = new ChatRoomReadStateScheduler({ submit });

    scheduler.schedule(121);
    scheduler.schedule(122);
    scheduler.schedule(123);

    await vi.advanceTimersByTimeAsync(399);
    expect(submit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(submit).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledWith(123);
  });

  it("지속 입력도 maxWait 이후 전송하고 in-flight 동안 더 큰 값만 이어서 전송한다", async () => {
    vi.useFakeTimers();
    let resolveFirst: (() => void) | undefined;
    const submit = vi
      .fn<(throughSequence: number) => Promise<number>>()
      .mockImplementationOnce(
        (throughSequence) =>
          new Promise((resolve) => {
            resolveFirst = () => resolve(throughSequence);
          }),
      )
      .mockImplementation(async (throughSequence) => throughSequence);
    const scheduler = new ChatRoomReadStateScheduler({ submit });

    scheduler.schedule(130);
    await vi.advanceTimersByTimeAsync(300);
    scheduler.schedule(131);
    await vi.advanceTimersByTimeAsync(300);
    scheduler.schedule(132);
    await vi.advanceTimersByTimeAsync(300);
    scheduler.schedule(133);
    await vi.advanceTimersByTimeAsync(300);
    scheduler.schedule(134);
    await vi.advanceTimersByTimeAsync(300);

    expect(submit).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenLastCalledWith(134);

    scheduler.schedule(135);
    scheduler.schedule(136);
    resolveFirst?.();
    await vi.advanceTimersByTimeAsync(0);

    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit).toHaveBeenLastCalledWith(136);
  });

  it("서버가 확인한 sequence 이하 값은 다시 전송하지 않는다", async () => {
    vi.useFakeTimers();
    const submit = vi.fn(async () => 200);
    const scheduler = new ChatRoomReadStateScheduler({ submit });

    scheduler.schedule(150);
    await vi.advanceTimersByTimeAsync(400);
    scheduler.schedule(199);
    await vi.advanceTimersByTimeAsync(400);

    expect(submit).toHaveBeenCalledOnce();
  });

  it("유효하지 않은 sequence와 timer 설정을 거절한다", () => {
    expect(
      () => new ChatRoomReadStateScheduler({ debounceMs: 500, maxWaitMs: 400, submit: vi.fn() }),
    ).toThrow(RangeError);
    const scheduler = new ChatRoomReadStateScheduler({ submit: vi.fn() });
    expect(() => scheduler.schedule(-1)).toThrow(RangeError);
  });
});
