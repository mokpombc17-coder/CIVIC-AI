import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attachChatRoomInboxRuntime,
  canShowRoomInboxCreateToast,
  shouldRefreshRoomInboxForMessageCommand,
  shouldRefreshRoomInboxForMessageMutation,
} from "./use-chat-room-inbox-runtime";
import { ROOM_INBOX_INVALIDATION_DEBOUNCE_MS } from "@/lib/chat/realtime/chat-room-inbox-event-coordinator";
import type {
  ChatMessageCommandEvent,
  ChatMessageMutationEvent,
  ChatRealtimeTransport,
  ChatRoomSessionSnapshot,
} from "@/lib/chat/realtime/chat-realtime-transport";
import type { ChatRoomInboxEvent } from "@/lib/chat/realtime/chat-stomp-contracts";

afterEach(() => {
  vi.useRealTimers();
});

describe("Room inbox runtime", () => {
  it("CREATE는 toast 후보와 reset을 만들고 UPDATE/DELETE는 reset만 만든다", () => {
    vi.useFakeTimers();
    const runtime = createRuntimeHarness();
    const detach = attachChatRoomInboxRuntime(runtime.options);

    runtime.emitInbox(CREATED_EVENT);
    vi.advanceTimersByTime(ROOM_INBOX_INVALIDATION_DEBOUNCE_MS);
    expect(runtime.onCreate).toHaveBeenCalledWith(CREATED_EVENT, 1);
    expect(runtime.onRefresh).toHaveBeenCalledTimes(1);

    runtime.emitInbox(UPDATED_EVENT);
    vi.advanceTimersByTime(ROOM_INBOX_INVALIDATION_DEBOUNCE_MS);
    runtime.emitInbox(DELETED_EVENT);
    vi.advanceTimersByTime(ROOM_INBOX_INVALIDATION_DEBOUNCE_MS);
    expect(runtime.onCreate).toHaveBeenCalledTimes(1);
    expect(runtime.onRefresh).toHaveBeenCalledTimes(3);

    detach();
  });

  it("동일 source event를 다시 받으면 toast와 reset을 중복 수행하지 않는다", () => {
    vi.useFakeTimers();
    const runtime = createRuntimeHarness();
    const detach = attachChatRoomInboxRuntime(runtime.options);

    runtime.emitInbox(CREATED_EVENT);
    runtime.emitInbox({ ...CREATED_EVENT, eventId: "550e8400-e29b-41d4-a716-446655440099" });
    vi.advanceTimersByTime(ROOM_INBOX_INVALIDATION_DEBOUNCE_MS);

    expect(runtime.onCreate).toHaveBeenCalledTimes(1);
    expect(runtime.onRefresh).toHaveBeenCalledTimes(1);
    detach();
  });

  it("연결 복구, focus, online과 성공한 local result를 같은 reset 경로로 합친다", () => {
    vi.useFakeTimers();
    const runtime = createRuntimeHarness();
    const detach = attachChatRoomInboxRuntime(runtime.options);

    runtime.connectionStatus = "connected";
    runtime.emitConnection();
    runtime.emitTarget("focus");
    runtime.emitTarget("online");
    runtime.emitCommand(createMessageCommandEvent("ACCEPTED"));
    runtime.emitMutation(createMessageMutationEvent("UPDATED"));
    vi.advanceTimersByTime(ROOM_INBOX_INVALIDATION_DEBOUNCE_MS);

    expect(runtime.onRefresh).toHaveBeenCalledTimes(1);
    detach();
  });

  it("cleanup 뒤에는 observer와 window 신호를 처리하지 않는다", () => {
    vi.useFakeTimers();
    const runtime = createRuntimeHarness();
    const detach = attachChatRoomInboxRuntime(runtime.options);
    detach();

    runtime.emitInbox(UPDATED_EVENT);
    runtime.emitCommand(createMessageCommandEvent("ACCEPTED"));
    runtime.emitMutation(createMessageMutationEvent("DELETED"));
    runtime.emitTarget("focus");
    vi.advanceTimersByTime(ROOM_INBOX_INVALIDATION_DEBOUNCE_MS);

    expect(runtime.onCreate).not.toHaveBeenCalled();
    expect(runtime.onRefresh).not.toHaveBeenCalled();
  });

  it.each([
    ["ACCEPTED", true],
    ["DUPLICATE", true],
    ["REJECTED", false],
    ["FAILED", false],
  ] as const)("send %s의 Room inbox reset 여부를 판정한다", (status, expected) => {
    expect(shouldRefreshRoomInboxForMessageCommand(createMessageCommandEvent(status))).toBe(
      expected,
    );
  });

  it.each([
    ["UPDATED", true],
    ["DELETED", true],
    ["ALREADY_DELETED", true],
    ["UNCHANGED", false],
    ["REJECTED", false],
    ["FAILED", false],
  ] as const)("mutation %s의 Room inbox reset 여부를 판정한다", (status, expected) => {
    expect(shouldRefreshRoomInboxForMessageMutation(createMessageMutationEvent(status))).toBe(
      expected,
    );
  });

  it("현재 Room, background, blur에서는 CREATE toast를 억제한다", () => {
    const inactiveRoom = createRoomSnapshot("active", "room-02");
    const activeRoom = createRoomSnapshot("active", "room-01");

    expect(
      canShowRoomInboxCreateToast(
        { visibilityState: "visible", hasFocus: () => true },
        inactiveRoom,
        "room-01",
      ),
    ).toBe(true);
    expect(
      canShowRoomInboxCreateToast(
        { visibilityState: "visible", hasFocus: () => true },
        activeRoom,
        "room-01",
      ),
    ).toBe(false);
    expect(
      canShowRoomInboxCreateToast(
        { visibilityState: "hidden", hasFocus: () => true },
        inactiveRoom,
        "room-01",
      ),
    ).toBe(false);
    expect(
      canShowRoomInboxCreateToast(
        { visibilityState: "visible", hasFocus: () => false },
        inactiveRoom,
        "room-01",
      ),
    ).toBe(false);
  });
});

const CREATED_EVENT: Extract<ChatRoomInboxEvent, { cause: "MESSAGE_CREATED" }> = {
  eventVersion: 2,
  eventId: "550e8400-e29b-41d4-a716-446655440000",
  eventType: "ROOM_INBOX_INVALIDATED",
  cause: "MESSAGE_CREATED",
  roomId: "room-01",
  roomNameHint: "토론방",
  emittedAt: "2026-08-05T08:00:00Z",
  sourceEventIds: ["chat-message-created:message-84"],
  coalescedCreateCount: 1,
  notificationHint: {
    messageId: "message-84",
    messageVersion: 1,
    senderMembershipId: "membership-2",
    messageCreatedAt: "2026-08-05T07:59:59Z",
    preview: "다음 회의는 월요일입니다.",
    previewTruncated: false,
  },
};

const UPDATED_EVENT: Extract<ChatRoomInboxEvent, { cause: "MESSAGE_UPDATED" }> = {
  ...CREATED_EVENT,
  eventId: "550e8400-e29b-41d4-a716-446655440001",
  cause: "MESSAGE_UPDATED",
  roomNameHint: null,
  sourceEventIds: ["chat-message-updated:message-84:v2"],
  coalescedCreateCount: null,
  notificationHint: null,
};

const DELETED_EVENT: Extract<ChatRoomInboxEvent, { cause: "MESSAGE_DELETED" }> = {
  ...CREATED_EVENT,
  eventId: "550e8400-e29b-41d4-a716-446655440002",
  cause: "MESSAGE_DELETED",
  roomNameHint: null,
  sourceEventIds: ["chat-message-deleted:message-84:v3"],
  coalescedCreateCount: null,
  notificationHint: null,
};

function createRuntimeHarness() {
  let connectionListener: (() => void) | null = null;
  let commandListener: ((event: ChatMessageCommandEvent) => void) | null = null;
  let mutationListener: ((event: ChatMessageMutationEvent) => void) | null = null;
  let inboxListener: ((event: ChatRoomInboxEvent) => void) | null = null;
  const targetListeners = new Map<"focus" | "online", () => void>();
  const onCreate = vi.fn();
  const onRefresh = vi.fn();
  const harness = {
    connectionStatus: "disconnected" as ReturnType<ChatRealtimeTransport["getSnapshot"]>["status"],
    emitCommand: (event: ChatMessageCommandEvent) => commandListener?.(event),
    emitConnection: () => connectionListener?.(),
    emitInbox: (event: ChatRoomInboxEvent) => inboxListener?.(event),
    emitMutation: (event: ChatMessageMutationEvent) => mutationListener?.(event),
    emitTarget: (type: "focus" | "online") => targetListeners.get(type)?.(),
    onCreate,
    onRefresh,
    options: {
      onCreate,
      onRefresh,
      target: {
        addEventListener: (type: "focus" | "online", listener: () => void) => {
          targetListeners.set(type, listener);
        },
        removeEventListener: (type: "focus" | "online", listener: () => void) => {
          if (targetListeners.get(type) === listener) {
            targetListeners.delete(type);
          }
        },
      },
      transport: {
        getSnapshot: () => ({ status: harness.connectionStatus, error: null }),
        observe: (listener: () => void) => {
          connectionListener = listener;
          return () => {
            connectionListener = null;
          };
        },
        observeMessageCommandEvent: (listener: (event: ChatMessageCommandEvent) => void) => {
          commandListener = listener;
          return () => {
            commandListener = null;
          };
        },
        observeMessageMutationEvent: (listener: (event: ChatMessageMutationEvent) => void) => {
          mutationListener = listener;
          return () => {
            mutationListener = null;
          };
        },
        observeRoomInboxEvent: (listener: (event: ChatRoomInboxEvent) => void) => {
          inboxListener = listener;
          return () => {
            inboxListener = null;
          };
        },
      },
    },
  };
  return harness;
}

function createMessageCommandEvent(
  status: "ACCEPTED" | "DUPLICATE" | "REJECTED" | "FAILED",
): ChatMessageCommandEvent {
  return {
    kind: "result",
    roomId: "room-01",
    result: {
      clientMessageId: "ed7d2fe8-996d-4660-822f-e84af1218743",
      status,
    },
  } as ChatMessageCommandEvent;
}

function createMessageMutationEvent(
  status: "UPDATED" | "UNCHANGED" | "DELETED" | "ALREADY_DELETED" | "REJECTED" | "FAILED",
): ChatMessageMutationEvent {
  return {
    kind: "result",
    roomId: "room-01",
    result: {
      clientMessageId: null,
      clientMutationId: "550e8400-e29b-41d4-a716-446655440010",
      status,
    },
  } as ChatMessageMutationEvent;
}

function createRoomSnapshot(
  status: ChatRoomSessionSnapshot["status"],
  roomId: string | null,
): ChatRoomSessionSnapshot {
  return {
    status,
    roomId,
    generation: 1,
    replacedByRoomId: null,
    messageVisibleAfterSequence: 0,
    watermarkSequence: 0,
    error: null,
  };
}
