import { describe, expect, it } from "vitest";
import {
  createLocalChatMessageMutationState,
  getChatMessageMutationErrorMessage,
  isChatMessageMutationPending,
  reduceChatMessageMutationLifecycle,
} from "./chat-message-mutation-state";

describe("chat message mutation state", () => {
  it("현재 방과 generation의 lifecycle을 messageId별 상태로 저장한다", () => {
    const queued = reduceChatMessageMutationLifecycle(
      new Map(),
      {
        attempt: 0,
        clientMutationId: "550e8400-e29b-41d4-a716-446655440010",
        commandType: "EDIT_MESSAGE",
        generation: 3,
        messageId: "message-01",
        reason: null,
        retryAt: null,
        roomId: "room-01",
        status: "queued",
      },
      {
        generation: 3,
        roomId: "room-01",
      },
    );

    expect(queued.get("message-01")).toEqual({
      clientMutationId: "550e8400-e29b-41d4-a716-446655440010",
      commandType: "EDIT_MESSAGE",
      error: null,
      status: "queued",
    });
    expect(isChatMessageMutationPending(queued.get("message-01") ?? null)).toBe(true);
  });

  it("다른 방 또는 이전 generation의 lifecycle은 무시한다", () => {
    const initial = new Map([
      [
        "message-01",
        createLocalChatMessageMutationState({
          clientMutationId: "550e8400-e29b-41d4-a716-446655440010",
          commandType: "DELETE_MESSAGE",
        }),
      ],
    ]);
    const result = reduceChatMessageMutationLifecycle(
      initial,
      {
        attempt: 1,
        clientMutationId: "550e8400-e29b-41d4-a716-446655440011",
        commandType: "DELETE_MESSAGE",
        generation: 2,
        messageId: "message-02",
        reason: null,
        retryAt: null,
        roomId: "room-02",
        status: "completed",
      },
      {
        generation: 3,
        roomId: "room-01",
      },
    );

    expect(result).toBe(initial);
  });

  it("최종 실패를 재시도 가능한 화면 오류 상태로 변환한다", () => {
    const failed = reduceChatMessageMutationLifecycle(
      new Map(),
      {
        attempt: 3,
        clientMutationId: "550e8400-e29b-41d4-a716-446655440010",
        commandType: "EDIT_MESSAGE",
        generation: 3,
        messageId: "message-01",
        reason: "MAX_ATTEMPTS_REACHED",
        retryAt: null,
        roomId: "room-01",
        status: "failed",
      },
      {
        generation: 3,
        roomId: "room-01",
      },
    );

    expect(failed.get("message-01")).toMatchObject({
      error: "메시지를 수정하지 못했어요. 잠시 후 다시 시도해 주세요.",
      status: "failed",
    });
    expect(isChatMessageMutationPending(failed.get("message-01") ?? null)).toBe(false);
  });

  it("수정과 삭제의 실패·취소 문구를 작업에 맞게 반환한다", () => {
    expect(getChatMessageMutationErrorMessage("EDIT_MESSAGE", "failed")).toBe(
      "메시지를 수정하지 못했어요. 잠시 후 다시 시도해 주세요.",
    );
    expect(getChatMessageMutationErrorMessage("EDIT_MESSAGE", "cancelled")).toBe(
      "메시지 수정이 취소됐어요. 다시 시도해 주세요.",
    );
    expect(getChatMessageMutationErrorMessage("DELETE_MESSAGE", "failed")).toBe(
      "메시지를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.",
    );
    expect(getChatMessageMutationErrorMessage("DELETE_MESSAGE", "cancelled")).toBe(
      "메시지 삭제가 취소됐어요. 다시 시도해 주세요.",
    );
  });
});
