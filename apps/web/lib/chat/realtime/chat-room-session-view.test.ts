import { describe, expect, it } from "vitest";
import { getChatRoomSessionView } from "./chat-room-session-view";

describe("getChatRoomSessionView", () => {
  it("현재 방이 활성화되면 초안 입력을 허용한다", () => {
    const view = getChatRoomSessionView(
      {
        status: "active",
        roomId: "room-01",
        generation: 1,
        replacedByRoomId: null,
        watermarkSequence: 120,
        error: null,
      },
      "room-01",
    );

    expect(view).toMatchObject({
      kind: "active",
      canDraft: true,
      canReactivate: false,
    });
  });

  it("다른 탭이 방을 선점하면 입력을 막고 재활성화를 제공한다", () => {
    const view = getChatRoomSessionView(
      {
        status: "replaced",
        roomId: "room-01",
        generation: 2,
        replacedByRoomId: "room-02",
        watermarkSequence: null,
        error: null,
      },
      "room-01",
    );

    expect(view).toMatchObject({
      kind: "replaced",
      title: "다른 탭에서 채팅방을 사용 중입니다.",
      canDraft: false,
      canReactivate: true,
    });
  });

  it("재시도할 수 없는 방 구독 오류는 재활성화를 제공하지 않는다", () => {
    const view = getChatRoomSessionView(
      {
        status: "error",
        roomId: "room-01",
        generation: 3,
        replacedByRoomId: null,
        watermarkSequence: null,
        error: {
          code: "SUBSCRIPTION_REJECTED",
          serverCode: "ACTIVE_ROOM_LIMIT_EXCEEDED",
          message: "서버가 방 구독을 거절했습니다.",
        },
      },
      "room-01",
    );

    expect(view).toMatchObject({
      kind: "error",
      description: "서버가 방 구독을 거절했습니다.",
      canDraft: false,
      canReactivate: false,
    });
  });

  it("일시적인 방 구독 오류는 재활성화를 제공한다", () => {
    const view = getChatRoomSessionView(
      {
        status: "error",
        roomId: "room-01",
        generation: 3,
        replacedByRoomId: null,
        watermarkSequence: null,
        error: {
          code: "SUBSCRIPTION_SYNC_REJECTED",
          retryable: true,
          serverCode: "ROOM_AUTHORIZATION_UNAVAILABLE",
          message: "권한 확인을 일시적으로 수행하지 못했습니다.",
        },
      },
      "room-01",
    );

    expect(view).toMatchObject({
      kind: "error",
      canDraft: false,
      canReactivate: true,
    });
  });

  it("연결이 다른 환경으로 교체되면 활성 방이어도 입력과 재활성화를 막는다", () => {
    const view = getChatRoomSessionView(
      {
        status: "active",
        roomId: "room-01",
        generation: 3,
        replacedByRoomId: null,
        watermarkSequence: 120,
        error: null,
        connectionStatus: "replaced",
        connectionError: {
          source: "websocket",
          code: "CONNECTION_REPLACED",
          message: "다른 기기에서 연결했습니다.",
        },
      },
      "room-01",
    );

    expect(view).toMatchObject({
      kind: "error",
      title: "다른 환경에서 채팅 연결을 사용 중입니다.",
      canDraft: false,
      canReactivate: false,
    });
  });

  it("재연결 중에는 활성 방이어도 입력을 막는다", () => {
    const view = getChatRoomSessionView(
      {
        status: "active",
        roomId: "room-01",
        generation: 3,
        replacedByRoomId: null,
        watermarkSequence: 120,
        error: null,
        connectionStatus: "reconnecting",
        connectionError: null,
      },
      "room-01",
    );

    expect(view).toMatchObject({
      kind: "pending",
      canDraft: false,
      canReactivate: false,
    });
  });

  it("방 활성화가 끝나기 전에는 대기 상태를 반환한다", () => {
    const view = getChatRoomSessionView(
      {
        status: "claiming",
        roomId: "room-01",
        generation: 1,
        replacedByRoomId: null,
        watermarkSequence: null,
        error: null,
      },
      "room-01",
    );

    expect(view).toMatchObject({
      kind: "pending",
      canDraft: false,
      canReactivate: false,
    });
  });
});
