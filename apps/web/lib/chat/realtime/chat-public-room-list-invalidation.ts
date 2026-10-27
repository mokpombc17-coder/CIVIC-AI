export const PUBLIC_ROOM_LIST_INVALIDATION_DELAY_MS = 400;
export const PUBLIC_ROOM_LIST_INVALIDATION_JITTER_MS = 600;

type TimerHandle = ReturnType<typeof setTimeout>;

type ChatPublicRoomListInvalidationSchedulerOptions = Readonly<{
  clearTimer?: (timer: TimerHandle) => void;
  onInvalidate: () => void;
  random?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
}>;

/**
 * 공개방 목록 무효화 신호는 서버가 접속 중인 사용자 전원에게 같은 순간 보내고, 짧은 시간에 여러 번 오거나 중복으로 올 수 있음.
 * 첫 신호 뒤 기다리는 동안 온 신호를 한 번의 조회로 합치고, 기다리는 시간을 사용자마다 다르게 해 조회가 한꺼번에 몰리지 않게 함.
 */
export class ChatPublicRoomListInvalidationScheduler {
  private timer: TimerHandle | null = null;

  constructor(private readonly options: ChatPublicRoomListInvalidationSchedulerOptions) {}

  request(): void {
    if (this.timer) {
      return;
    }

    const setTimer = this.options.setTimer ?? setTimeout;
    const random = this.options.random ?? Math.random;
    const delayMs =
      PUBLIC_ROOM_LIST_INVALIDATION_DELAY_MS +
      Math.floor(random() * PUBLIC_ROOM_LIST_INVALIDATION_JITTER_MS);

    this.timer = setTimer(() => {
      this.timer = null;
      this.options.onInvalidate();
    }, delayMs);
  }

  dispose(): void {
    if (!this.timer) {
      return;
    }

    (this.options.clearTimer ?? clearTimeout)(this.timer);
    this.timer = null;
  }
}
