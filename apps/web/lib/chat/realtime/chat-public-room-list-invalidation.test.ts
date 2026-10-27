import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChatPublicRoomListInvalidationScheduler,
  PUBLIC_ROOM_LIST_INVALIDATION_DELAY_MS,
  PUBLIC_ROOM_LIST_INVALIDATION_JITTER_MS,
} from "./chat-public-room-list-invalidation";

afterEach(() => {
  vi.useRealTimers();
});

describe("ChatPublicRoomListInvalidationScheduler", () => {
  it("기다리는 동안 온 신호를 한 번의 조회로 합친다", () => {
    vi.useFakeTimers();
    const onInvalidate = vi.fn();
    const scheduler = new ChatPublicRoomListInvalidationScheduler({
      onInvalidate,
      random: () => 0,
    });

    scheduler.request();
    vi.advanceTimersByTime(PUBLIC_ROOM_LIST_INVALIDATION_DELAY_MS - 1);
    scheduler.request();
    expect(onInvalidate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onInvalidate).toHaveBeenCalledTimes(1);

    scheduler.request();
    vi.advanceTimersByTime(PUBLIC_ROOM_LIST_INVALIDATION_DELAY_MS);
    expect(onInvalidate).toHaveBeenCalledTimes(2);
  });

  it("사용자마다 기다리는 시간을 무작위로 늘려 조회가 한꺼번에 몰리지 않게 한다", () => {
    const setTimer = vi.fn<
      (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
    >(() => setTimeout(() => undefined, 0));

    new ChatPublicRoomListInvalidationScheduler({
      onInvalidate: vi.fn(),
      random: () => 0,
      setTimer,
    }).request();
    new ChatPublicRoomListInvalidationScheduler({
      onInvalidate: vi.fn(),
      random: () => 0.999,
      setTimer,
    }).request();

    expect(setTimer.mock.calls.map(([, delayMs]) => delayMs)).toEqual([
      PUBLIC_ROOM_LIST_INVALIDATION_DELAY_MS,
      PUBLIC_ROOM_LIST_INVALIDATION_DELAY_MS + PUBLIC_ROOM_LIST_INVALIDATION_JITTER_MS - 1,
    ]);
  });

  it("정리한 뒤에는 기다리던 조회를 하지 않는다", () => {
    vi.useFakeTimers();
    const onInvalidate = vi.fn();
    const scheduler = new ChatPublicRoomListInvalidationScheduler({ onInvalidate });

    scheduler.request();
    scheduler.dispose();
    vi.advanceTimersByTime(
      PUBLIC_ROOM_LIST_INVALIDATION_DELAY_MS + PUBLIC_ROOM_LIST_INVALIDATION_JITTER_MS,
    );

    expect(onInvalidate).not.toHaveBeenCalled();
  });
});
