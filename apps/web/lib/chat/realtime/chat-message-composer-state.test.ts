import { describe, expect, it } from "vitest";
import {
  applyChatMessageCommandEvent,
  applyChatMessageDeliveryLifecycle,
  createSendingChatMessageSubmission,
  isPendingChatMessageSubmission,
} from "./chat-message-composer-state";
import type { ChatMessageDeliveryLifecycleEvent } from "./chat-message-delivery-scheduler";

const CLIENT_MESSAGE_ID = "550e8400-e29b-41d4-a716-446655440000";
const ROOM_ID = "room-1";
const GENERATION = 3;
const CONTENT = "안녕하세요.";

function createSending() {
  return createSendingChatMessageSubmission({
    clientMessageId: CLIENT_MESSAGE_ID,
    content: CONTENT,
    generation: GENERATION,
    roomId: ROOM_ID,
  });
}

function createLifecycle(
  overrides: Partial<ChatMessageDeliveryLifecycleEvent>,
): ChatMessageDeliveryLifecycleEvent {
  return {
    attempt: 1,
    clientMessageId: CLIENT_MESSAGE_ID,
    generation: GENERATION,
    reason: null,
    retryAt: null,
    roomId: ROOM_ID,
    status: "sending",
    ...overrides,
  };
}

describe("chat message composer state", () => {
  it("admission 재전송 대기를 오류가 아닌 pending 상태로 유지한다", () => {
    const transition = applyChatMessageDeliveryLifecycle(
      createSending(),
      createLifecycle({
        retryAt: 2_000,
        status: "retry-waiting",
      }),
    );

    expect(transition).toEqual({
      restoreDraft: null,
      submission: {
        attempt: 1,
        clientMessageId: CLIENT_MESSAGE_ID,
        content: CONTENT,
        generation: GENERATION,
        retryAt: 2_000,
        roomId: ROOM_ID,
        status: "retry-waiting",
      },
    });
    expect(isPendingChatMessageSubmission(transition?.submission ?? null)).toBe(true);
  });

  it("재전송 attempt를 동일 submission에 반영한다", () => {
    const waiting = applyChatMessageDeliveryLifecycle(
      createSending(),
      createLifecycle({
        retryAt: 2_000,
        status: "retry-waiting",
      }),
    )?.submission;
    const transition = applyChatMessageDeliveryLifecycle(
      waiting ?? null,
      createLifecycle({
        attempt: 2,
        status: "sending",
      }),
    );

    expect(transition?.submission).toMatchObject({
      attempt: 2,
      retryAt: null,
      status: "sending",
    });
  });

  it("sent lifecycle을 정상 완료 상태로 전환한다", () => {
    const transition = applyChatMessageDeliveryLifecycle(
      createSending(),
      createLifecycle({ status: "sent" }),
    );

    expect(transition).toEqual({
      restoreDraft: null,
      submission: {
        clientMessageId: CLIENT_MESSAGE_ID,
        content: CONTENT,
        generation: GENERATION,
        roomId: ROOM_ID,
        status: "sent",
      },
    });
  });

  it("cancelled lifecycle은 오류 없이 content를 draft로 복구한다", () => {
    const transition = applyChatMessageDeliveryLifecycle(
      createSending(),
      createLifecycle({
        reason: "ROOM_REPLACED",
        status: "cancelled",
      }),
    );

    expect(transition).toEqual({
      restoreDraft: CONTENT,
      submission: null,
    });
  });

  it("다른 room, generation 또는 clientMessageId lifecycle은 무시한다", () => {
    const current = createSending();

    expect(
      applyChatMessageDeliveryLifecycle(current, createLifecycle({ roomId: "room-2" })),
    ).toBeNull();
    expect(
      applyChatMessageDeliveryLifecycle(current, createLifecycle({ generation: GENERATION + 1 })),
    ).toBeNull();
    expect(
      applyChatMessageDeliveryLifecycle(
        current,
        createLifecycle({ clientMessageId: "f47ac10b-58cc-4372-a567-0e02b2c3d479" }),
      ),
    ).toBeNull();
  });

  it("자동 admission 재시도 한도 초과 뒤에는 수동 재전송을 제안하지 않는다", () => {
    const pendingFailure = applyChatMessageDeliveryLifecycle(
      createSending(),
      createLifecycle({
        reason: "MAX_ATTEMPTS_REACHED",
        status: "failed",
      }),
    )?.submission;
    const transition = applyChatMessageCommandEvent(
      pendingFailure ?? null,
      {
        kind: "result",
        roomId: ROOM_ID,
        result: {
          clientMessageId: CLIENT_MESSAGE_ID,
          code: "USER_RATE_LIMITED",
          messageId: null,
          retryable: true,
          retryAfterMs: 1_000,
          roomSequence: null,
          status: "REJECTED",
        },
      },
      5_000,
    );

    expect(transition).toEqual({
      restoreDraft: CONTENT,
      submission: {
        clientMessageId: CLIENT_MESSAGE_ID,
        content: CONTENT,
        generation: GENERATION,
        message: "메시지를 너무 빠르게 전송했습니다. 잠시 후 다시 시도해 주세요.",
        retryAt: 6_000,
        retryReady: false,
        retryable: false,
        roomId: ROOM_ID,
        status: "failed",
      },
    });
  });

  it("admission 대기 중 전체 제한시간을 넘긴 generic 실패도 수동 재전송을 제안하지 않는다", () => {
    const waiting = applyChatMessageDeliveryLifecycle(
      createSending(),
      createLifecycle({
        retryAt: 2_000,
        status: "retry-waiting",
      }),
    )?.submission;
    const pendingFailure = applyChatMessageDeliveryLifecycle(
      waiting ?? null,
      createLifecycle({
        reason: "MAX_ELAPSED_TIME_REACHED",
        status: "failed",
      }),
    )?.submission;
    const transition = applyChatMessageCommandEvent(pendingFailure ?? null, {
      kind: "failure",
      clientMessageId: CLIENT_MESSAGE_ID,
      code: "MESSAGE_PUBLISH_FAILED",
      message: "메시지 자동 재전송 제한 시간을 초과했습니다.",
      retryable: true,
      roomId: ROOM_ID,
    });

    expect(transition?.submission).toMatchObject({
      retryReady: false,
      retryable: false,
      status: "failed",
    });
  });

  it("admission 이외의 retryable terminal 실패는 기존 수동 복구 계약을 유지한다", () => {
    const transition = applyChatMessageCommandEvent(
      createSending(),
      {
        kind: "failure",
        clientMessageId: CLIENT_MESSAGE_ID,
        code: "MESSAGE_PUBLISH_FAILED",
        message: "STOMP 메시지 전송에 실패했습니다.",
        retryable: true,
        roomId: ROOM_ID,
      },
      5_000,
    );

    expect(transition?.restoreDraft).toBe(CONTENT);
    expect(transition?.submission).toMatchObject({
      retryAt: 5_000,
      retryReady: true,
      retryable: true,
      status: "failed",
    });
  });

  it("lifecycle을 지원하는 transport 이전의 성공 command 결과도 처리한다", () => {
    const transition = applyChatMessageCommandEvent(createSending(), {
      kind: "result",
      roomId: ROOM_ID,
      result: {
        clientMessageId: CLIENT_MESSAGE_ID,
        code: null,
        messageId: "message-1",
        retryable: false,
        retryAfterMs: null,
        roomSequence: 1,
        status: "ACCEPTED",
      },
    });

    expect(transition?.submission).toMatchObject({
      status: "sent",
    });
  });
});
