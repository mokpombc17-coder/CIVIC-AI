import { describe, expect, it } from "vitest";
import type { ApplyChatRealtimeDeliveryResult } from "@/lib/chat/realtime/chat-realtime-query-coordinator";
import {
  initialChatRealtimeQueryCoordinatorState,
  reduceChatRealtimeQueryCoordinatorState,
  type ChatRealtimeQueryCoordinatorViewState,
} from "./chat-realtime-query-coordinator-state";

const DELIVERY_RESULT: ApplyChatRealtimeDeliveryResult = {
  deliveryId: "delivery-01",
  messageCount: 2,
  messageMerge: {
    gaps: [],
    lastContiguousSequence: null,
    messages: [],
  },
  readReceiptEventCount: 1,
  roomEventCount: 1,
};

describe("reduceChatRealtimeQueryCoordinatorState", () => {
  it("coordinator 시작 시 이전 세션의 모든 상태를 초기화한다", () => {
    const state = createPopulatedState();

    expect(reduceChatRealtimeQueryCoordinatorState(state, { type: "coordinatorStarted" })).toEqual(
      initialChatRealtimeQueryCoordinatorState,
    );
  });

  it("복구 시작과 완료 동안 동기화 상태를 기존 callback 의미대로 전이한다", () => {
    const synchronized = reduceChatRealtimeQueryCoordinatorState(
      initialChatRealtimeQueryCoordinatorState,
      { type: "synchronized" },
    );
    const recovering = reduceChatRealtimeQueryCoordinatorState(synchronized, {
      type: "recoveryStarted",
    });
    const recovered = reduceChatRealtimeQueryCoordinatorState(recovering, {
      type: "recoveryCompleted",
    });

    expect(recovering).toMatchObject({
      error: null,
      isRecovering: true,
      isSynchronized: false,
    });
    expect(recovered).toMatchObject({
      error: null,
      isRecovering: false,
      isSynchronized: false,
    });
  });

  it("복구 완료는 기존 동기화 여부를 변경하지 않는다", () => {
    const recovered = reduceChatRealtimeQueryCoordinatorState(createPopulatedState(), {
      type: "recoveryCompleted",
    });

    expect(recovered).toMatchObject({
      error: null,
      isRecovering: false,
      isSynchronized: true,
    });
  });

  it("delivery 적용 결과를 보관하고 coordinator를 동기화 상태로 전환한다", () => {
    const state = reduceChatRealtimeQueryCoordinatorState(createPopulatedState(), {
      result: DELIVERY_RESULT,
      type: "deliveryApplied",
    });

    expect(state).toMatchObject({
      error: null,
      isRecovering: false,
      isSynchronized: true,
      lastApplied: DELIVERY_RESULT,
    });
  });

  it("coordinator 오류는 복구와 동기화를 중단하되 마지막 적용 결과는 유지한다", () => {
    const error = new Error("merge failed");
    const state = reduceChatRealtimeQueryCoordinatorState(createPopulatedState(), {
      cause: error,
      type: "coordinatorFailed",
    });

    expect(state).toMatchObject({
      error,
      isRecovering: false,
      isSynchronized: false,
      lastApplied: DELIVERY_RESULT,
    });
  });

  it("알 수 없는 coordinator 오류를 사용자에게 노출 가능한 Error로 정규화한다", () => {
    const state = reduceChatRealtimeQueryCoordinatorState(
      initialChatRealtimeQueryCoordinatorState,
      { cause: "unknown failure", type: "coordinatorFailed" },
    );

    expect(state.error).toEqual(
      new Error("실시간 채팅 cache 병합 중 알 수 없는 오류가 발생했습니다."),
    );
  });

  it("read receipt 상태는 coordinator 상태와 독립적으로 갱신한다", () => {
    const error = new Error("receipt failed");
    const failed = reduceChatRealtimeQueryCoordinatorState(createPopulatedState(), {
      cause: error,
      type: "readReceiptFailed",
    });
    const ready = reduceChatRealtimeQueryCoordinatorState(failed, {
      error: null,
      status: "ready",
      type: "readReceiptStateChanged",
    });

    expect(failed).toMatchObject({
      error: createPopulatedState().error,
      isRecovering: true,
      isSynchronized: true,
      readReceiptError: error,
      readReceiptStatus: "refreshing",
    });
    expect(ready).toMatchObject({
      readReceiptError: null,
      readReceiptStatus: "ready",
    });
  });

  it("read receipt snapshot의 알 수 없는 오류도 Error로 정규화한다", () => {
    const state = reduceChatRealtimeQueryCoordinatorState(
      initialChatRealtimeQueryCoordinatorState,
      {
        error: "receipt snapshot failed",
        status: "error",
        type: "readReceiptStateChanged",
      },
    );

    expect(state.readReceiptError).toEqual(
      new Error("실시간 채팅 cache 병합 중 알 수 없는 오류가 발생했습니다."),
    );
    expect(state.readReceiptStatus).toBe("error");
  });

  it("재시도는 두 오류만 지우고 진행 중인 상태와 마지막 결과를 유지한다", () => {
    const state = createPopulatedState();
    const retried = reduceChatRealtimeQueryCoordinatorState(state, {
      type: "retryRequested",
    });

    expect(retried).toEqual({
      ...state,
      error: null,
      readReceiptError: null,
    });
  });
});

function createPopulatedState(): ChatRealtimeQueryCoordinatorViewState {
  return {
    error: new Error("coordinator failed"),
    isRecovering: true,
    isSynchronized: true,
    lastApplied: DELIVERY_RESULT,
    readReceiptError: new Error("receipt failed"),
    readReceiptStatus: "refreshing",
  };
}
