import { describe, expect, it } from "vitest";
import {
  createChatMessageViewportState,
  reduceChatMessageViewportState,
} from "./chat-message-viewport-state";

describe("chat message viewport state", () => {
  it("과거 이력 유무에 맞는 초기 상태를 만든다", () => {
    expect(createChatMessageViewportState(true)).toEqual({
      olderHistory: "idle",
      position: "initializing",
      unseenMessageCount: 0,
    });
    expect(createChatMessageViewportState(false).olderHistory).toBe("exhausted");
  });

  it("사용자가 하단에서 벗어나면 실시간 새 메시지 수를 누적한다", () => {
    const detached = reduceChatMessageViewportState(createChatMessageViewportState(true), {
      type: "viewport-ready",
      isAtEnd: false,
    });
    const withNewMessages = reduceChatMessageViewportState(detached, {
      type: "messages-appended",
      count: 2,
      source: "realtime",
    });

    expect(withNewMessages).toMatchObject({
      position: "detached",
      unseenMessageCount: 2,
    });
  });

  it("하단을 보고 있거나 직접 보낸 메시지는 별도 미확인 수로 쌓지 않는다", () => {
    const pinned = reduceChatMessageViewportState(createChatMessageViewportState(true), {
      type: "viewport-ready",
      isAtEnd: true,
    });
    const afterRealtime = reduceChatMessageViewportState(pinned, {
      type: "messages-appended",
      count: 1,
      source: "realtime",
    });
    const detached = reduceChatMessageViewportState(afterRealtime, {
      type: "scroll-position-changed",
      isAtEnd: false,
    });
    const afterOwnMessage = reduceChatMessageViewportState(detached, {
      type: "messages-appended",
      count: 1,
      source: "current-user",
    });

    expect(afterRealtime).toBe(pinned);
    expect(afterOwnMessage).toMatchObject({
      position: "pinned",
      unseenMessageCount: 0,
    });
  });

  it("하단으로 돌아오면 새 메시지 수를 초기화한다", () => {
    const state = reduceChatMessageViewportState(
      {
        olderHistory: "idle",
        position: "detached",
        unseenMessageCount: 3,
      },
      {
        type: "scroll-position-changed",
        isAtEnd: true,
      },
    );

    expect(state).toMatchObject({
      position: "pinned",
      unseenMessageCount: 0,
    });
  });

  it("같은 스크롤 구간의 반복 이벤트에는 기존 상태 참조를 유지한다", () => {
    const state = {
      olderHistory: "idle",
      position: "pinned",
      unseenMessageCount: 0,
    } as const;

    expect(
      reduceChatMessageViewportState(state, {
        type: "scroll-position-changed",
        isAtEnd: true,
      }),
    ).toBe(state);
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

  it("방 세션이 바뀌면 스크롤과 과거 이력 상태를 함께 초기화한다", () => {
    const reset = reduceChatMessageViewportState(
      {
        olderHistory: "error",
        position: "detached",
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
        type: "messages-appended",
        count: 0,
        source: "realtime",
      }),
    ).toThrow(RangeError);
  });
});
