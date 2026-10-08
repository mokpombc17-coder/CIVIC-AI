import { describe, expect, it } from "vitest";
import { getChatRoomSessionView } from "./chat-room-session-view";

describe("getChatRoomSessionView", () => {
  it("종료된 방은 구독 오류 대신 읽기 전용 안내를 표시한다", () => {
    const view = getChatRoomSessionView(
      {
        status: "error",
        roomId: "room-01",
        generation: 3,
        replacedByRoomId: null,
        messageVisibleAfterSequence: null,
        watermarkSequence: null,
        error: {
          code: "ROOM_CLOSED",
          message: "채팅방이 종료되었습니다.",
        },
      },
      "room-01",
      false,
      "CLOSED",
    );

    expect(view).toMatchObject({
      kind: "closed",
      title: "종료된 토론방입니다.",
      canDraft: false,
      canReactivate: false,
      canReconnect: false,
      indicatorLabel: "종료됨",
      indicatorTone: "pending",
      showNotice: true,
    });
  });

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
      title: "다른 토론방에서 채팅 중이에요.",
      description: "이 토론방의 채팅은 잠시 대기 중이에요.",
      canDraft: false,
      canReactivate: true,
      indicatorLabel: "다른 토론방 사용 중",
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
          message: "토론방이 종료되어 연결이 해제되었습니다.",
        },
      },
      "room-01",
    );

    expect(view).toMatchObject({
      kind: "error",
      description: "토론방이 종료되어 연결이 해제되었습니다.",
      canDraft: false,
      canReactivate: false,
    });
  });

  it("연결이 다른 환경으로 교체되면 현재 화면에서 다시 시작하는 안내를 반환한다", () => {
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
      kind: "connection-replaced",
      title: "현재 채팅을 사용할 수 없습니다.",
      description:
        "다른 기기나 창에서 채팅이 시작되었습니다. 여기서 계속하면 다른 쪽 채팅은 중단됩니다.",
      canDraft: false,
      canReactivate: false,
      canReconnect: false,
      indicatorLabel: "다른 곳에서 사용 중",
      indicatorTone: "pending",
      showNotice: true,
    });
  });

  it("인증이 필요하면 기다림이 아닌 로그인 필요 상태를 반환한다", () => {
    const view = getChatRoomSessionView(
      {
        status: "active",
        roomId: "room-01",
        generation: 3,
        replacedByRoomId: null,
        messageVisibleAfterSequence: 100,
        watermarkSequence: 120,
        error: null,
        connectionStatus: "authentication-required",
        connectionError: {
          source: "stomp",
          code: "AUTHENTICATION_REQUIRED",
          message: "채팅 연결 인증이 만료되었습니다. 다시 로그인해 주세요.",
        },
      },
      "room-01",
    );

    expect(view).toMatchObject({
      kind: "authentication-required",
      title: "채팅을 계속하려면 로그인이 필요합니다.",
      description: "채팅 연결 인증이 만료되었습니다. 다시 로그인해 주세요.",
      canDraft: false,
      canReactivate: false,
      canReconnect: false,
      indicatorLabel: "로그인 필요",
      indicatorTone: "negative",
      showNotice: true,
    });
  });

  it("오류 없이 연결이 종료되면 복구 안내를 노출하지 않는다", () => {
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
      kind: "pending",
      canDraft: false,
      canReconnect: false,
      indicatorLabel: "준비 중",
      showNotice: false,
    });
  });

  it("오류와 함께 연결이 끊기면 다시 연결할 수 있는 오류 상태를 반환한다", () => {
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
        connectionError: {
          source: "websocket",
          message: "실시간 연결이 예기치 않게 종료되었습니다.",
        },
      },
      "room-01",
    );

    expect(view).toMatchObject({
      kind: "error",
      description: "실시간 연결이 예기치 않게 종료되었습니다.",
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
