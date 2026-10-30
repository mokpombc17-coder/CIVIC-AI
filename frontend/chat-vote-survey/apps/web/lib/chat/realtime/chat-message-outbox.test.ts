import { describe, expect, it, vi } from "vitest";
import type { ChatMessageDeliveryLifecycleEvent } from "./chat-message-delivery-scheduler";
import { ChatMessageOutbox } from "./chat-message-outbox";
import type { ChatMessageCommandEvent, ChatRealtimeTransport } from "./chat-realtime-transport";

const FIRST_ID = "550e8400-e29b-41d4-a716-446655440000";
const SECOND_ID = "ed7d2fe8-996d-4660-822f-e84af1218743";

describe("ChatMessageOutbox", () => {
  it("메시지를 transport보다 먼저 optimistic queue에 넣고 lifecycle을 독립적으로 반영한다", () => {
    const harness = createHarness();
    const outbox = new ChatMessageOutbox(harness.transport, { now: () => 1_000 });
    outbox.attach();

    outbox.enqueue(createInput(FIRST_ID, "  첫 번째  "));
    outbox.enqueue(createInput(SECOND_ID, "두 번째"));

    expect(harness.sent).toHaveLength(2);
    expect(outbox.getSnapshot()).toMatchObject([
      {
        clientMessageId: FIRST_ID,
        content: "첫 번째",
        status: "queued",
      },
      {
        clientMessageId: SECOND_ID,
        content: "두 번째",
        status: "queued",
      },
    ]);

    harness.emitLifecycle(createLifecycle(FIRST_ID, "sending"));
    harness.emitLifecycle(createLifecycle(SECOND_ID, "queued", 0));

    expect(outbox.getSnapshot().map(({ status }) => status)).toEqual(["sending", "queued"]);
  });

  it("admission retry는 오류가 아니라 retry-waiting으로 유지하고 확정 이벤트까지 accepted를 보관한다", () => {
    const harness = createHarness();
    const outbox = new ChatMessageOutbox(harness.transport);
    outbox.attach();
    outbox.enqueue(createInput(FIRST_ID, "메시지"));

    harness.emitLifecycle({
      ...createLifecycle(FIRST_ID, "retry-waiting"),
      retryAt: 2_000,
    });
    expect(outbox.getSnapshot()[0]).toMatchObject({
      message: null,
      retryAt: 2_000,
      status: "retry-waiting",
    });

    harness.emitLifecycle(createLifecycle(FIRST_ID, "sent"));
    expect(outbox.getSnapshot()[0]?.status).toBe("accepted");

    expect(outbox.acknowledgeConfirmed("room-01", new Set([FIRST_ID]))).toBe(1);
    expect(outbox.getSnapshot()).toEqual([]);
  });

  it("최종 command 실패는 해당 optimistic 메시지에만 표시한다", () => {
    const harness = createHarness();
    const outbox = new ChatMessageOutbox(harness.transport);
    outbox.attach();
    outbox.enqueue(createInput(FIRST_ID, "메시지"));

    harness.emitLifecycle({
      ...createLifecycle(FIRST_ID, "failed"),
      reason: "MAX_ATTEMPTS_REACHED",
    });
    harness.emitCommand({
      kind: "result",
      roomId: "room-01",
      result: {
        clientMessageId: FIRST_ID,
        status: "REJECTED",
        code: "USER_RATE_LIMITED",
        retryable: true,
        retryAfterMs: 1_000,
        messageId: null,
        roomSequence: null,
      },
    });

    expect(outbox.getSnapshot()[0]).toMatchObject({
      message: "메시지를 너무 빠르게 전송했습니다. 잠시 후 다시 시도해 주세요.",
      status: "failed",
    });
  });

  it("Strict Mode와 같은 attach-detach 반복에서 observer를 중복 등록하지 않는다", () => {
    const harness = createHarness();
    const outbox = new ChatMessageOutbox(harness.transport);
    const detach = outbox.attach();
    detach();
    const detachAgain = outbox.attach();

    expect(harness.observeCommand).toHaveBeenCalledTimes(2);
    expect(harness.observeLifecycle).toHaveBeenCalledTimes(2);

    detachAgain();
    expect(harness.unsubscribeCommand).toHaveBeenCalledTimes(2);
    expect(harness.unsubscribeLifecycle).toHaveBeenCalledTimes(2);
  });
});

function createInput(clientMessageId: string, content: string) {
  return {
    clientMessageId,
    content,
    generation: 3,
    roomId: "room-01",
  };
}

function createLifecycle(
  clientMessageId: string,
  status: ChatMessageDeliveryLifecycleEvent["status"],
  attempt = 1,
): ChatMessageDeliveryLifecycleEvent {
  return {
    attempt,
    clientMessageId,
    generation: 3,
    reason: status === "failed" || status === "cancelled" ? "TEST_REASON" : null,
    retryAt: null,
    roomId: "room-01",
    status,
  };
}

function createHarness() {
  const commandListeners = new Set<(event: ChatMessageCommandEvent) => void>();
  const lifecycleListeners = new Set<(event: ChatMessageDeliveryLifecycleEvent) => void>();
  const sent: Parameters<ChatRealtimeTransport["sendRoomMessage"]>[0][] = [];
  const unsubscribeCommand = vi.fn();
  const unsubscribeLifecycle = vi.fn();
  const observeCommand = vi.fn((listener: (event: ChatMessageCommandEvent) => void) => {
    commandListeners.add(listener);
    return () => {
      commandListeners.delete(listener);
      unsubscribeCommand();
    };
  });
  const observeLifecycle = vi.fn((listener: (event: ChatMessageDeliveryLifecycleEvent) => void) => {
    lifecycleListeners.add(listener);
    return () => {
      lifecycleListeners.delete(listener);
      unsubscribeLifecycle();
    };
  });
  const transport = {
    observeMessageCommandEvent: observeCommand,
    observeMessageDeliveryLifecycle: observeLifecycle,
    sendRoomMessage: (command) => sent.push(command),
  } satisfies Pick<
    ChatRealtimeTransport,
    "observeMessageCommandEvent" | "observeMessageDeliveryLifecycle" | "sendRoomMessage"
  >;

  return {
    emitCommand: (event: ChatMessageCommandEvent) =>
      commandListeners.forEach((listener) => listener(event)),
    emitLifecycle: (event: ChatMessageDeliveryLifecycleEvent) =>
      lifecycleListeners.forEach((listener) => listener(event)),
    observeCommand,
    observeLifecycle,
    sent,
    transport,
    unsubscribeCommand,
    unsubscribeLifecycle,
  };
}
