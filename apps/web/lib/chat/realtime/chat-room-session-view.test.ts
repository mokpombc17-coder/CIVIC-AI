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

  it("현재 방의 구독 오류를 표시하고 재시도를 허용한다", () => {
    const view = getChatRoomSessionView(
      {
        status: "error",
        roomId: "room-01",
        generation: 3,
        replacedByRoomId: null,
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
      canReactivate: true,
    });
  });

  it("방 활성화가 끝나기 전에는 대기 상태를 반환한다", () => {
    const view = getChatRoomSessionView(
      {
        status: "claiming",
        roomId: "room-01",
        generation: 1,
        replacedByRoomId: null,
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
