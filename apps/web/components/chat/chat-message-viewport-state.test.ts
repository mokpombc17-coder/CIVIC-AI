import { describe, expect, it } from "vitest";
import {
  createChatMessageViewportState,
  findChatMessageInitialScrollIndex,
  reduceChatMessageViewportState,
} from "./chat-message-viewport-state";

describe("chat message viewport state", () => {
  it("과거 이력 유무에 맞는 초기 상태를 만든다", () => {
    expect(createChatMessageViewportState(true)).toEqual({
      olderHistory: "idle",
      unseenMessageCount: 0,
    });
    expect(createChatMessageViewportState(false).olderHistory).toBe("exhausted");
  });

  it("진입 목표에 맞는 초기 스크롤 row를 찾는다", () => {
    const items = [
      { kind: "date-separator" as const },
      { kind: "message" as const, messageId: "message-01" },
      { afterSequence: 13, kind: "read-boundary" as const },
      { kind: "message" as const, messageId: "message-02" },
    ];

    expect(findChatMessageInitialScrollIndex(items, { kind: "pending" })).toBeNull();
    expect(findChatMessageInitialScrollIndex(items, { kind: "latest" })).toBe(3);
    expect(findChatMessageInitialScrollIndex(items, { kind: "first-message" })).toBe(1);
    expect(
      findChatMessageInitialScrollIndex(items, {
        kind: "message",
        messageId: "message-02",
      }),
    ).toBe(3);
    expect(
      findChatMessageInitialScrollIndex(items, {
        kind: "message",
        messageId: "message-missing",
      }),
    ).toBeNull();
    expect(
      findChatMessageInitialScrollIndex(items, {
        afterSequence: 13,
        kind: "read-boundary",
      }),
    ).toBe(2);
    expect(
      findChatMessageInitialScrollIndex(items, {
        afterSequence: 12,
        kind: "read-boundary",
      }),
    ).toBeNull();
  });

  it("따라가지 않은 새 메시지 수를 누적한다", () => {
    const once = reduceChatMessageViewportState(createChatMessageViewportState(true), {
      type: "unseen-messages-added",
      count: 2,
    });
    const twice = reduceChatMessageViewportState(once, {
      type: "unseen-messages-added",
      count: 1,
    });

    expect(twice.unseenMessageCount).toBe(3);
  });

  it("하단에 도달하거나 최신 이동을 요청하면 새 메시지 수를 초기화한다", () => {
    const state = {
      olderHistory: "idle",
      unseenMessageCount: 3,
    } as const;

    expect(reduceChatMessageViewportState(state, { type: "latest-reached" })).toEqual({
      olderHistory: "idle",
      unseenMessageCount: 0,
    });
    expect(reduceChatMessageViewportState(state, { type: "jump-to-latest" })).toEqual({
      olderHistory: "idle",
      unseenMessageCount: 0,
    });
  });

  it("새 메시지 수가 이미 0이면 기존 상태 참조를 유지한다", () => {
    const state = createChatMessageViewportState(true);

    expect(reduceChatMessageViewportState(state, { type: "latest-reached" })).toBe(state);
    expect(reduceChatMessageViewportState(state, { type: "jump-to-latest" })).toBe(state);
  });

  it("과거 이력 요청의 loading, error, exhausted 상태를 독립적으로 관리한다", () => {
    const initial = createChatMessageViewportState(true);
    const loading = reduceChatMessageViewportState(initial, {
      type: "load-older-started",
    });
    const failed = reduceChatMessageViewportState(loading, {
      type: "load-older-failed",
    });
    const retrying = reduceChatMessageViewportState(failed, {
      type: "load-older-started",
    });
    const exhausted = reduceChatMessageViewportState(retrying, {
      type: "load-older-succeeded",
      hasOlderMessages: false,
    });

    expect(loading.olderHistory).toBe("loading");
    expect(failed.olderHistory).toBe("error");
    expect(retrying.olderHistory).toBe("loading");
    expect(exhausted.olderHistory).toBe("exhausted");
  });

  it("최신 이력 응답 후 과거 페이지 가용성이 바뀌면 idle 상태로 전환한다", () => {
    const initial = createChatMessageViewportState(false);
    const available = reduceChatMessageViewportState(initial, {
      type: "older-availability-changed",
      hasOlderMessages: true,
    });

    expect(available.olderHistory).toBe("idle");
  });

  it("방 세션이 바뀌면 새 메시지 수와 과거 이력 상태를 함께 초기화한다", () => {
    const reset = reduceChatMessageViewportState(
      {
        olderHistory: "error",
        unseenMessageCount: 4,
      },
      {
        type: "reset",
        hasOlderMessages: true,
      },
    );

    expect(reset).toEqual(createChatMessageViewportState(true));
  });

  it("추가 메시지 수가 올바르지 않으면 상태 오염을 막는다", () => {
    expect(() =>
      reduceChatMessageViewportState(createChatMessageViewportState(true), {
        type: "unseen-messages-added",
        count: 0,
      }),
    ).toThrow(RangeError);
  });
});
