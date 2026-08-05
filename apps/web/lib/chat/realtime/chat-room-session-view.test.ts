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
        messageVisibleAfterSequence: 100,
        watermarkSequence: 120,
        error: null,
      },
      "room-01",
    );

    expect(view).toMatchObject({
      kind: "active",
      canDraft: true,
      canReactivate: false,
      indicatorLabel: "채팅 가능",
      indicatorTone: "positive",
      showNotice: false,
    });
  });

  it("활성 방의 메시지 동기화가 끝나기 전에는 준비 상태를 반환한다", () => {
    const view = getChatRoomSessionView(
      {
        status: "active",
        roomId: "room-01",
        generation: 1,
        replacedByRoomId: null,
        messageVisibleAfterSequence: 100,
        watermarkSequence: 120,
        error: null,
      },
      "room-01",
      false,
    );

    expect(view).toMatchObject({
      kind: "pending",
      canDraft: false,
      indicatorLabel: "준비 중",
      indicatorTone: "pending",
      showNotice: false,
    });
  });

  it("다른 탭이 방을 선점하면 입력을 막고 재활성화를 제공한다", () => {
    const view = getChatRoomSessionView(
      {
        status: "replaced",
        roomId: "room-01",
        generation: 2,
        replacedByRoomId: "room-02",
        messageVisibleAfterSequence: null,
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
      indicatorLabel: "다른 탭 사용 중",
      showNotice: true,
    });
  });

  it("재시도할 수 없는 방 구독 오류는 재활성화를 제공하지 않는다", () => {
    const view = getChatRoomSessionView(
      {
        status: "error",
        roomId: "room-01",
        generation: 3,
        replacedByRoomId: null,
        messageVisibleAfterSequence: null,
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
        messageVisibleAfterSequence: null,
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

  it("종료된 방은 다시 활성화할 수 없다", () => {
    const view = getChatRoomSessionView(
      {
        status: "error",
        roomId: "room-01",
        generation: 4,
        replacedByRoomId: null,
        messageVisibleAfterSequence: null,
        watermarkSequence: null,
        error: {
          code: "ROOM_CLOSED",
          serverCode: "ROOM_CLOSED",
          message: "채팅방이 종료되어 실시간 연결이 해제되었습니다.",
        },
      },
      "room-01",
    );

    expect(view).toMatchObject({
      kind: "error",
      description: "채팅방이 종료되어 실시간 연결이 해제되었습니다.",
      canDraft: false,
      canReactivate: false,
    });
  });

  it("연결이 다른 환경으로 교체되면 활성 방이어도 입력과 재활성화를 막는다", () => {
    const view = getChatRoomSessionView(
      {
        status: "active",
        roomId: "room-01",
        generation: 3,
        replacedByRoomId: null,
        messageVisibleAfterSequence: 100,
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
      canReconnect: false,
      indicatorLabel: "채팅 불가",
      showNotice: true,
    });
  });

  it("연결이 끊기면 헤더에서 다시 연결할 수 있는 오류 상태를 반환한다", () => {
    const view = getChatRoomSessionView(
      {
        status: "active",
        roomId: "room-01",
        generation: 3,
        replacedByRoomId: null,
        messageVisibleAfterSequence: 100,
        watermarkSequence: 120,
        error: null,
        connectionStatus: "disconnected",
        connectionError: null,
      },
      "room-01",
    );

    expect(view).toMatchObject({
      kind: "error",
      canDraft: false,
      canReconnect: true,
      indicatorLabel: "채팅 불가",
      showNotice: true,
    });
  });

  it("재연결 중에는 활성 방이어도 입력을 막는다", () => {
    const view = getChatRoomSessionView(
      {
        status: "active",
        roomId: "room-01",
        generation: 3,
        replacedByRoomId: null,
        messageVisibleAfterSequence: 100,
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
        messageVisibleAfterSequence: null,
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
