import { describe, expect, it } from "vitest";
import type { ChatMessageCommandResult } from "./chat-stomp-contracts";
import {
  calculateChatMessageAdmissionRetryDelay,
  DEFAULT_CHAT_MESSAGE_ADMISSION_RETRY_POLICY,
  selectChatMessageAdmissionRetrySignal,
  type ChatMessageAdmissionRetryPolicy,
  type ChatMessageAdmissionRetrySignal,
} from "./chat-message-admission-control";

describe("selectChatMessageAdmissionRetrySignal", () => {
  it("retryable USER_RATE_LIMITED와 SERVER_BUSY만 선택한다", () => {
    expect(
      selectChatMessageAdmissionRetrySignal(createRejectedResult("USER_RATE_LIMITED", 1_000, true)),
    ).toEqual({
      code: "USER_RATE_LIMITED",
      retryAfterMs: 1_000,
    });
    expect(
      selectChatMessageAdmissionRetrySignal(createRejectedResult("SERVER_BUSY", null, true)),
    ).toEqual({
      code: "SERVER_BUSY",
      retryAfterMs: null,
    });
    expect(
      selectChatMessageAdmissionRetrySignal(
        createRejectedResult("PERSISTENCE_FAILED", 1_000, true),
      ),
    ).toBeNull();
  });

  it("retryable=false와 FAILED 결과는 자동 재전송 대상으로 선택하지 않는다", () => {
    expect(
      selectChatMessageAdmissionRetrySignal(
        createRejectedResult("USER_RATE_LIMITED", 1_000, false),
      ),
    ).toBeNull();
    expect(
      selectChatMessageAdmissionRetrySignal({
        ...createRejectedResult("SERVER_BUSY", 1_000, true),
        status: "FAILED",
      }),
    ).toBeNull();
  });

  it("USER_RATE_LIMITED에 서버 최소 대기시간이 없으면 계약 이상으로 간주한다", () => {
    expect(
      selectChatMessageAdmissionRetrySignal(createRejectedResult("USER_RATE_LIMITED", null, true)),
    ).toBeNull();
  });
});

describe("calculateChatMessageAdmissionRetryDelay", () => {
  it("서버 retryAfterMs를 최소 대기시간으로 보존하고 그 뒤에만 jitter를 더한다", () => {
    const signal: ChatMessageAdmissionRetrySignal = {
      code: "USER_RATE_LIMITED",
      retryAfterMs: 1_000,
    };

    expect(
      calculateChatMessageAdmissionRetryDelay({
        signal,
        randomFraction: 0,
      }),
    ).toBe(1_000);
    expect(
      calculateChatMessageAdmissionRetryDelay({
        signal,
        randomFraction: 0.5,
      }),
    ).toBe(1_500);
    expect(
      calculateChatMessageAdmissionRetryDelay({
        signal,
        randomFraction: 0.999_999,
      }),
    ).toBe(2_000);
  });

  it("retryAfterMs가 없는 SERVER_BUSY의 첫 재시도를 500~1,500ms로 분산한다", () => {
    const signal: ChatMessageAdmissionRetrySignal = {
      code: "SERVER_BUSY",
      retryAfterMs: null,
    };

    expect(
      calculateChatMessageAdmissionRetryDelay({
        signal,
        randomFraction: 0,
      }),
    ).toBe(500);
    expect(
      calculateChatMessageAdmissionRetryDelay({
        signal,
        randomFraction: 0.999_999,
      }),
    ).toBe(1_500);
  });

  it("이전 delay를 기준으로 fallback 범위를 증가시키되 최대 30초를 넘지 않는다", () => {
    const signal: ChatMessageAdmissionRetrySignal = {
      code: "SERVER_BUSY",
      retryAfterMs: null,
    };

    expect(
      calculateChatMessageAdmissionRetryDelay({
        signal,
        previousDelayMs: 1_500,
        randomFraction: 0.999_999,
      }),
    ).toBe(4_500);
    expect(
      calculateChatMessageAdmissionRetryDelay({
        signal,
        previousDelayMs: 20_000,
        randomFraction: 0.999_999,
      }),
    ).toBe(30_000);
  });

  it("정책값과 난수 입력이 잘못되면 조용히 보정하지 않고 거절한다", () => {
    const signal: ChatMessageAdmissionRetrySignal = {
      code: "SERVER_BUSY",
      retryAfterMs: null,
    };
    const invalidPolicy: ChatMessageAdmissionRetryPolicy = {
      ...DEFAULT_CHAT_MESSAGE_ADMISSION_RETRY_POLICY,
      fallbackMaxDelayMs: 100,
    };

    expect(() =>
      calculateChatMessageAdmissionRetryDelay({
        signal,
        randomFraction: 1,
      }),
    ).toThrow(RangeError);
    expect(() =>
      calculateChatMessageAdmissionRetryDelay({
        policy: invalidPolicy,
        signal,
        randomFraction: 0.5,
      }),
    ).toThrow(RangeError);
    expect(() =>
      calculateChatMessageAdmissionRetryDelay({
        signal,
        previousDelayMs: -1,
        randomFraction: 0.5,
      }),
    ).toThrow(RangeError);
  });
});

function createRejectedResult(
  code: string,
  retryAfterMs: number | null,
  retryable: boolean,
): Extract<ChatMessageCommandResult, { status: "REJECTED" }> {
  return {
    clientMessageId: "ed7d2fe8-996d-4660-822f-e84af1218743",
    status: "REJECTED",
    code,
    retryable,
    retryAfterMs,
    messageId: null,
    roomSequence: null,
  };
}
