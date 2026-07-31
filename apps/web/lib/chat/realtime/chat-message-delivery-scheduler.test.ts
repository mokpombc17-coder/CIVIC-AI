import { describe, expect, it, vi } from "vitest";
import {
  ChatMessageDeliveryScheduler,
  type ChatMessageDeliverySnapshot,
  type ChatMessageDeliveryTerminalEvent,
} from "./chat-message-delivery-scheduler";
import type { ChatMessageCommandResult } from "./chat-stomp-contracts";

const CLIENT_MESSAGE_ID = "ed7d2fe8-996d-4660-822f-e84af1218743";
const SECOND_CLIENT_MESSAGE_ID = "a42cc7c9-354c-4a67-b6b7-2f660942b21d";

describe("ChatMessageDeliveryScheduler", () => {
  it("정규화한 메시지를 즉시 한 번 publish하고 command 결과 timeout을 건다", () => {
    const harness = createHarness();

    const snapshot = harness.scheduler.start(createDeliveryInput({ content: "  안녕하세요.  " }));

    expect(harness.published).toEqual([
      {
        request: {
          clientMessageId: CLIENT_MESSAGE_ID,
          content: "안녕하세요.",
        },
        roomId: "room-01",
      },
    ]);
    expect(snapshot).toMatchObject({
      attempt: 1,
      firstSentAt: 1_000,
      ownerId: "owner-01",
      status: "sending",
    });
    expect(harness.nextTimerDelay()).toBe(15_000);
  });

  it("USER_RATE_LIMITED 결과를 서버 대기시간 이후 jitter를 더해 같은 메시지로 재전송한다", () => {
    const harness = createHarness({ randomFraction: 0.5 });
    harness.scheduler.start(createDeliveryInput());

    expect(
      harness.scheduler.handleCommandResult(createRejectedResult("USER_RATE_LIMITED", 1_000)),
    ).toBe(true);
    expect(harness.scheduler.getSnapshot(CLIENT_MESSAGE_ID)).toMatchObject({
      attempt: 1,
      previousDelayMs: 1_500,
      scheduledAt: 2_500,
      status: "retry-waiting",
    });
    expect(harness.nextTimerDelay()).toBe(1_500);

    harness.runNextTimer();

    expect(harness.published).toHaveLength(2);
    expect(harness.published[1]).toEqual(harness.published[0]);
    expect(harness.scheduler.getSnapshot(CLIENT_MESSAGE_ID)).toMatchObject({
      attempt: 2,
      scheduledAt: null,
      status: "sending",
    });
  });

  it("SERVER_BUSY에 retryAfterMs가 없으면 이전 대기시간을 바탕으로 decorrelated jitter를 계산한다", () => {
    const harness = createHarness({ randomFraction: 0 });
    harness.scheduler.start(createDeliveryInput());

    harness.scheduler.handleCommandResult(createRejectedResult("SERVER_BUSY", null));
    expect(harness.nextTimerDelay()).toBe(500);
    harness.runNextTimer();

    harness.scheduler.handleCommandResult(createRejectedResult("SERVER_BUSY", null));

    expect(harness.nextTimerDelay()).toBe(500);
    expect(harness.scheduler.getSnapshot(CLIENT_MESSAGE_ID)?.previousDelayMs).toBe(500);
  });

  it("retry-waiting 중 들어온 중복 command 결과는 새 timer를 만들지 않는다", () => {
    const harness = createHarness();
    const result = createRejectedResult("SERVER_BUSY", 500);
    harness.scheduler.start(createDeliveryInput());

    expect(harness.scheduler.handleCommandResult(result)).toBe(true);
    const scheduledTimerCount = harness.timerCount();

    expect(harness.scheduler.handleCommandResult(result)).toBe(false);
    expect(harness.timerCount()).toBe(scheduledTimerCount);
  });

  it.each(["ACCEPTED", "DUPLICATE"] as const)(
    "%s 결과를 sent terminal로 전달하고 delivery를 제거한다",
    (status) => {
      const harness = createHarness();
      harness.scheduler.start(createDeliveryInput());

      harness.scheduler.handleCommandResult(createSuccessfulResult(status));

      expect(harness.scheduler.size).toBe(0);
      expect(harness.terminals).toEqual([
        expect.objectContaining({
          kind: "sent",
          result: expect.objectContaining({ status }),
        }),
      ]);
      expect(harness.timerCount()).toBe(0);
    },
  );

  it("admission 대상이 아닌 거절은 자동 재시도하지 않고 실패로 종료한다", () => {
    const harness = createHarness();
    harness.scheduler.start(createDeliveryInput());

    harness.scheduler.handleCommandResult(createRejectedResult("MESSAGE_TOO_LONG", null, false));

    expect(harness.published).toHaveLength(1);
    expect(harness.terminals).toEqual([
      expect.objectContaining({
        kind: "failed",
        reason: "COMMAND_REJECTED",
      }),
    ]);
  });

  it("최대 publish 횟수에 도달하면 다음 admission retry를 예약하지 않는다", () => {
    const harness = createHarness({
      limits: {
        commandResultTimeoutMs: 1_000,
        maxAttempts: 2,
        maxElapsedMs: 10_000,
      },
    });
    harness.scheduler.start(createDeliveryInput());
    harness.scheduler.handleCommandResult(createRejectedResult("SERVER_BUSY", 1));
    harness.runNextTimer();

    harness.scheduler.handleCommandResult(createRejectedResult("SERVER_BUSY", 1));

    expect(harness.published).toHaveLength(2);
    expect(harness.terminals.at(-1)).toMatchObject({
      kind: "failed",
      reason: "MAX_ATTEMPTS_REACHED",
      result: {
        code: "SERVER_BUSY",
        status: "REJECTED",
      },
    });
    expect(harness.timerCount()).toBe(0);
  });

  it("재전송 예정 시각이 최대 수명을 넘으면 예약하지 않고 실패한다", () => {
    const harness = createHarness({
      limits: {
        commandResultTimeoutMs: 1_000,
        maxAttempts: 5,
        maxElapsedMs: 2_000,
      },
    });
    harness.scheduler.start(createDeliveryInput());

    harness.scheduler.handleCommandResult(createRejectedResult("USER_RATE_LIMITED", 2_000));

    expect(harness.terminals.at(-1)).toMatchObject({
      kind: "failed",
      reason: "MAX_ELAPSED_TIME_REACHED",
    });
    expect(harness.timerCount()).toBe(0);
  });

  it("재전송 직전 owner와 generation 문맥이 바뀌었으면 publish하지 않고 취소한다", () => {
    const harness = createHarness({ isContextCurrent: () => false });
    harness.scheduler.start(createDeliveryInput());
    harness.scheduler.handleCommandResult(createRejectedResult("SERVER_BUSY", 1));

    harness.runNextTimer();

    expect(harness.published).toHaveLength(1);
    expect(harness.terminals.at(-1)).toMatchObject({
      kind: "cancelled",
      reason: "DELIVERY_CONTEXT_STALE",
    });
  });

  it("명시적 cancel은 timer를 제거하고 이미 보관한 callback도 재전송하지 못하게 한다", () => {
    const harness = createHarness();
    harness.scheduler.start(createDeliveryInput());
    harness.scheduler.handleCommandResult(createRejectedResult("SERVER_BUSY", 1));
    const callback = harness.peekNextTimerCallback();

    expect(harness.scheduler.cancel(CLIENT_MESSAGE_ID, "ROOM_RELEASED")).toBe(true);
    callback();

    expect(harness.published).toHaveLength(1);
    expect(harness.terminals.at(-1)).toMatchObject({
      kind: "cancelled",
      reason: "ROOM_RELEASED",
    });
  });

  it("command 결과가 timeout 안에 없으면 admission retry 없이 실패한다", () => {
    const harness = createHarness();
    harness.scheduler.start(createDeliveryInput());

    harness.runNextTimer();

    expect(harness.published).toHaveLength(1);
    expect(harness.terminals.at(-1)).toMatchObject({
      kind: "failed",
      reason: "COMMAND_RESULT_TIMEOUT",
    });
  });

  it("retry publish 예외를 terminal 실패로 바꾸고 timer와 delivery를 정리한다", () => {
    const publishError = new Error("broker unavailable");
    let publishAttempt = 0;
    const harness = createHarness({
      publishImplementation: () => {
        publishAttempt += 1;

        if (publishAttempt === 2) {
          throw publishError;
        }
      },
    });
    harness.scheduler.start(createDeliveryInput());
    harness.scheduler.handleCommandResult(createRejectedResult("SERVER_BUSY", 1));

    harness.runNextTimer();

    expect(harness.terminals.at(-1)).toMatchObject({
      cause: publishError,
      kind: "failed",
      reason: "PUBLISH_FAILED",
    });
    expect(harness.scheduler.size).toBe(0);
    expect(harness.timerCount()).toBe(0);
  });

  it("cancelMatching은 선택한 owner의 delivery만 취소한다", () => {
    const harness = createHarness();
    harness.scheduler.start(createDeliveryInput());
    harness.scheduler.start(
      createDeliveryInput({
        clientMessageId: SECOND_CLIENT_MESSAGE_ID,
        ownerId: "owner-02",
      }),
    );

    expect(
      harness.scheduler.cancelMatching(({ ownerId }) => ownerId === "owner-01", "OWNER_DETACHED"),
    ).toBe(1);

    expect(harness.scheduler.getSnapshot(CLIENT_MESSAGE_ID)).toBeNull();
    expect(harness.scheduler.getSnapshot(SECOND_CLIENT_MESSAGE_ID)).not.toBeNull();
  });
});

type TimerEntry = {
  callback: () => void;
  delayMs: number;
  handle: ReturnType<typeof setTimeout>;
};

type HarnessOptions = Readonly<{
  isContextCurrent?: (snapshot: ChatMessageDeliverySnapshot) => boolean;
  limits?: {
    commandResultTimeoutMs: number;
    maxAttempts: number;
    maxElapsedMs: number;
  };
  publishImplementation?: (command: unknown) => void;
  randomFraction?: number;
}>;

function createHarness({
  isContextCurrent,
  limits,
  publishImplementation,
  randomFraction = 0,
}: HarnessOptions = {}) {
  let now = 1_000;
  let nextHandle = 1;
  const timers = new Map<ReturnType<typeof setTimeout>, TimerEntry>();
  const published: Array<{
    request: { clientMessageId: string; content: string };
    roomId: string;
  }> = [];
  const states: ChatMessageDeliverySnapshot[] = [];
  const terminals: ChatMessageDeliveryTerminalEvent[] = [];
  const publish = vi.fn((command) => {
    published.push(command);
    publishImplementation?.(command);
  });

  const scheduler = new ChatMessageDeliveryScheduler({
    ...(isContextCurrent ? { isContextCurrent } : {}),
    ...(limits ? { limits } : {}),
    cancelTimer(handle) {
      timers.delete(handle);
    },
    now: () => now,
    onStateChange: (snapshot) => states.push(snapshot),
    onTerminal: (event) => terminals.push(event),
    publish,
    random: () => randomFraction,
    scheduleTimer(callback, delayMs) {
      const handle = nextHandle as unknown as ReturnType<typeof setTimeout>;
      nextHandle += 1;
      timers.set(handle, { callback, delayMs, handle });
      return handle;
    },
  });

  function nextTimer(): TimerEntry {
    const timer = timers.values().next().value;

    if (!timer) {
      throw new Error("실행할 timer가 없습니다.");
    }

    return timer;
  }

  return {
    nextTimerDelay: () => nextTimer().delayMs,
    peekNextTimerCallback: () => nextTimer().callback,
    published,
    runNextTimer() {
      const timer = nextTimer();
      timers.delete(timer.handle);
      now += timer.delayMs;
      timer.callback();
    },
    scheduler,
    states,
    terminals,
    timerCount: () => timers.size,
  };
}

function createDeliveryInput({
  clientMessageId = CLIENT_MESSAGE_ID,
  content = "안녕하세요.",
  ownerId = "owner-01",
}: {
  clientMessageId?: string;
  content?: string;
  ownerId?: string;
} = {}) {
  return {
    generation: 3,
    ownerId,
    request: {
      clientMessageId,
      content,
    },
    roomId: "room-01",
  };
}

function createRejectedResult(
  code: string,
  retryAfterMs: number | null,
  retryable = true,
): ChatMessageCommandResult {
  return {
    clientMessageId: CLIENT_MESSAGE_ID,
    status: "REJECTED",
    code,
    retryable,
    retryAfterMs,
    messageId: null,
    roomSequence: null,
  };
}

function createSuccessfulResult(status: "ACCEPTED" | "DUPLICATE"): ChatMessageCommandResult {
  return {
    clientMessageId: CLIENT_MESSAGE_ID,
    status,
    code: null,
    retryable: false,
    retryAfterMs: null,
    messageId: "message-01",
    roomSequence: 1,
  };
}
