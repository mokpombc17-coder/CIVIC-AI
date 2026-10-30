import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChatMessageMutationScheduler,
  createChatMessageMutationStateLifecycleEvent,
  createChatMessageMutationTerminalLifecycleEvent,
  type ChatMessageMutationLifecycleEvent,
  type ChatMessageMutationTerminalEvent,
} from "./chat-message-mutation-scheduler";
import type { ChatMessageMutationCommandResult } from "./chat-stomp-contracts";

const EDIT_MUTATION_ID = "550e8400-e29b-41d4-a716-446655440010";
const DELETE_MUTATION_ID = "550e8400-e29b-41d4-a716-446655440011";

afterEach(() => {
  vi.useRealTimers();
});

describe("ChatMessageMutationScheduler", () => {
  it("retryAfterMs와 jitter 뒤 동일한 수정 ID와 payload를 재전송한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const publish = vi.fn();
    const lifecycle: ChatMessageMutationLifecycleEvent[] = [];
    const terminal: ChatMessageMutationTerminalEvent[] = [];
    const scheduler = new ChatMessageMutationScheduler({
      now: () => Date.now(),
      onStateChange: (snapshot) => {
        lifecycle.push(createChatMessageMutationStateLifecycleEvent(snapshot));
      },
      onTerminal: (event) => {
        terminal.push(event);
        lifecycle.push(createChatMessageMutationTerminalLifecycleEvent(event));
      },
      publish,
      random: () => 0.5,
    });
    const request = {
      clientMutationId: EDIT_MUTATION_ID,
      messageId: "message-01",
      content: "수정된 메시지",
    };

    scheduler.start({
      commandType: "EDIT_MESSAGE",
      generation: 3,
      ownerId: "port-1",
      request,
      roomId: "room-01",
    });
    scheduler.handleCommandResult(
      createMutationFailure({
        clientMutationId: EDIT_MUTATION_ID,
        code: "USER_RATE_LIMITED",
        commandType: "EDIT_MESSAGE",
        retryAfterMs: 1_000,
        status: "REJECTED",
      }),
    );

    expect(lifecycle.at(-1)).toMatchObject({
      attempt: 1,
      clientMutationId: EDIT_MUTATION_ID,
      retryAt: 1_500,
      status: "retry-waiting",
    });

    await vi.advanceTimersByTimeAsync(1_499);
    expect(publish).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[1]?.[0]).toEqual(publish.mock.calls[0]?.[0]);

    scheduler.handleCommandResult(createEditSuccess("UPDATED"));

    expect(terminal).toHaveLength(1);
    expect(terminal[0]).toMatchObject({
      kind: "completed",
      result: {
        clientMutationId: EDIT_MUTATION_ID,
        status: "UPDATED",
      },
    });
    expect(lifecycle.at(-1)?.status).toBe("completed");
  });

  it("retryAfterMs가 없으면 transport backoff로 동일 삭제 요청을 재시도한다", async () => {
    vi.useFakeTimers();
    const publish = vi.fn();
    const scheduler = new ChatMessageMutationScheduler({
      now: () => Date.now(),
      publish,
      random: () => 0,
    });
    const request = {
      clientMutationId: DELETE_MUTATION_ID,
      messageId: "message-01",
    };

    scheduler.start({
      commandType: "DELETE_MESSAGE",
      generation: 1,
      ownerId: "port-1",
      request,
      roomId: "room-01",
    });
    scheduler.handleCommandResult(
      createMutationFailure({
        clientMutationId: DELETE_MUTATION_ID,
        code: "PERSISTENCE_FAILED",
        commandType: "DELETE_MESSAGE",
        retryAfterMs: null,
        status: "FAILED",
      }),
    );

    await vi.advanceTimersByTimeAsync(499);
    expect(publish).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[1]?.[0]).toEqual(publish.mock.calls[0]?.[0]);
  });

  it.each(["UNCHANGED", "ALREADY_DELETED"] as const)(
    "%s no-op result도 pending lifecycle을 정상 종료한다",
    (status) => {
      const terminal = vi.fn();
      const scheduler = new ChatMessageMutationScheduler({
        onTerminal: terminal,
        publish: vi.fn(),
      });

      if (status === "UNCHANGED") {
        scheduler.start({
          commandType: "EDIT_MESSAGE",
          generation: 1,
          ownerId: "port-1",
          request: {
            clientMutationId: EDIT_MUTATION_ID,
            messageId: "message-01",
            content: "같은 메시지",
          },
          roomId: "room-01",
        });
        scheduler.handleCommandResult(createEditSuccess(status));
      } else {
        scheduler.start({
          commandType: "DELETE_MESSAGE",
          generation: 1,
          ownerId: "port-1",
          request: {
            clientMutationId: DELETE_MUTATION_ID,
            messageId: "message-01",
          },
          roomId: "room-01",
        });
        scheduler.handleCommandResult({
          clientMessageId: null,
          clientMutationId: DELETE_MUTATION_ID,
          replayed: false,
          code: null,
          retryable: false,
          retryAfterMs: null,
          messageId: "message-01",
          roomSequence: 1,
          messageVersion: 2,
          commandType: "DELETE_MESSAGE",
          status,
          messageState: "DELETED_BY_AUTHOR",
        });
      }

      expect(terminal).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "completed",
          result: expect.objectContaining({ status }),
        }),
      );
    },
  );

  it("non-retryable 거절은 재전송하지 않고 failed로 종료한다", () => {
    const publish = vi.fn();
    const terminal = vi.fn();
    const scheduler = new ChatMessageMutationScheduler({
      onTerminal: terminal,
      publish,
    });

    scheduler.start({
      commandType: "EDIT_MESSAGE",
      generation: 1,
      ownerId: "port-1",
      request: {
        clientMutationId: EDIT_MUTATION_ID,
        messageId: "message-01",
        content: "수정",
      },
      roomId: "room-01",
    });
    scheduler.handleCommandResult(
      createMutationFailure({
        clientMutationId: EDIT_MUTATION_ID,
        code: "MESSAGE_MUTATION_FORBIDDEN",
        commandType: "EDIT_MESSAGE",
        retryAfterMs: null,
        retryable: false,
        status: "REJECTED",
      }),
    );

    expect(publish).toHaveBeenCalledTimes(1);
    expect(terminal).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "failed",
        reason: "COMMAND_REJECTED",
      }),
    );
  });
});

function createEditSuccess(status: "UNCHANGED" | "UPDATED"): ChatMessageMutationCommandResult {
  return {
    clientMessageId: null,
    clientMutationId: EDIT_MUTATION_ID,
    replayed: false,
    code: null,
    retryable: false,
    retryAfterMs: null,
    messageId: "message-01",
    roomSequence: 1,
    messageVersion: status === "UPDATED" ? 2 : 1,
    commandType: "EDIT_MESSAGE",
    status,
    messageState: "ACTIVE",
  };
}

function createMutationFailure({
  clientMutationId,
  code,
  commandType,
  retryAfterMs,
  retryable = true,
  status,
}: {
  clientMutationId: string;
  code: string;
  commandType: "DELETE_MESSAGE" | "EDIT_MESSAGE";
  retryAfterMs: number | null;
  retryable?: boolean;
  status: "FAILED" | "REJECTED";
}): ChatMessageMutationCommandResult {
  if (status === "FAILED") {
    return {
      clientMessageId: null,
      clientMutationId,
      replayed: false,
      code,
      retryable,
      retryAfterMs: null,
      messageId: "message-01",
      roomSequence: null,
      messageVersion: null,
      commandType,
      status,
      messageState: null,
    };
  }

  return {
    clientMessageId: null,
    clientMutationId,
    replayed: false,
    code,
    retryable,
    retryAfterMs,
    messageId: "message-01",
    roomSequence: null,
    messageVersion: null,
    commandType,
    status,
    messageState: null,
  };
}
