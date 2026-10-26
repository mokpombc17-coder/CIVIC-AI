import { describe, expect, it } from "vitest";
import {
  createChatMessageOlderHistoryState,
  findChatMessageInitialScrollIndex,
  reduceChatMessageOlderHistory,
} from "./chat-message-viewport-state";

describe("chat message viewport state", () => {
  it("과거 이력 유무에 맞는 초기 상태를 만든다", () => {
    expect(createChatMessageOlderHistoryState(true)).toEqual({
      status: "idle",
    });
    expect(createChatMessageOlderHistoryState(false).status).toBe("exhausted");
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

  it("기억해 둔 위치로 돌아갈 때는 같은 render key의 row를 찾는다", () => {
    const items = [
      { kind: "date-separator" as const, renderKey: "date-1" },
      { kind: "message" as const, messageId: "message-01", renderKey: "client-message-a" },
      { kind: "message" as const, messageId: "message-02", renderKey: "client-message-b" },
    ];

    expect(
      findChatMessageInitialScrollIndex(items, {
        kind: "anchor",
        offsetFromViewportTop: 12,
        renderKey: "client-message-b",
      }),
    ).toBe(2);
    expect(
      findChatMessageInitialScrollIndex(items, {
        kind: "anchor",
        offsetFromViewportTop: 12,
        renderKey: "client-message-missing",
      }),
    ).toBeNull();
  });

  it("과거 이력 요청의 loading, error, exhausted 상태를 독립적으로 관리한다", () => {
    const initial = createChatMessageOlderHistoryState(true);
    const loading = reduceChatMessageOlderHistory(initial, {
      type: "load-older-started",
    });
    const failed = reduceChatMessageOlderHistory(loading, {
      type: "load-older-failed",
    });
    const retrying = reduceChatMessageOlderHistory(failed, {
      type: "load-older-started",
    });
    const exhausted = reduceChatMessageOlderHistory(retrying, {
      type: "load-older-succeeded",
      hasOlderMessages: false,
    });

    expect(loading.status).toBe("loading");
    expect(failed.status).toBe("error");
    expect(retrying.status).toBe("loading");
    expect(exhausted.status).toBe("exhausted");
  });

  it("최신 이력 응답 후 과거 페이지 가용성이 바뀌면 idle 상태로 전환한다", () => {
    const initial = createChatMessageOlderHistoryState(false);
    const available = reduceChatMessageOlderHistory(initial, {
      type: "older-availability-changed",
      hasOlderMessages: true,
    });

    expect(available.status).toBe("idle");
  });

  it("방 세션이 바뀌면 과거 이력 상태를 초기화한다", () => {
    const reset = reduceChatMessageOlderHistory(
      {
        status: "error",
      },
      {
        type: "reset",
        hasOlderMessages: true,
      },
    );

    expect(reset).toEqual(createChatMessageOlderHistoryState(true));
  });

  it("진행 중인 과거 이력 요청을 취소하면 loading만 가용성에 맞는 상태로 되돌린다", () => {
    const loading = reduceChatMessageOlderHistory(createChatMessageOlderHistoryState(true), {
      type: "load-older-started",
    });

    expect(
      reduceChatMessageOlderHistory(loading, {
        type: "load-older-cancelled",
        hasOlderMessages: true,
      }).status,
    ).toBe("idle");
    expect(
      reduceChatMessageOlderHistory(loading, {
        type: "load-older-cancelled",
        hasOlderMessages: false,
      }).status,
    ).toBe("exhausted");

    const failed = { status: "error" } as const;
    expect(
      reduceChatMessageOlderHistory(failed, {
        type: "load-older-cancelled",
        hasOlderMessages: true,
      }),
    ).toBe(failed);
  });
});
