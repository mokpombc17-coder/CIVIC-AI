import { describe, expect, it } from "vitest";
import {
  createChatRoomMessageHistoryFeedback,
  toChatRoomErrorMessage,
} from "./use-chat-room-content-experience";

describe("ChatRoom content experience", () => {
  it("비활성 Room과 최초 loading을 서로 다른 안내로 표현한다", () => {
    expect(
      createChatRoomMessageHistoryFeedback({
        error: null,
        isActive: false,
        isError: false,
        isPending: true,
        messageCount: 0,
      }),
    ).toEqual({
      kind: "notice",
      message: "실시간 방 구독이 준비되면 최근 메시지를 불러옵니다.",
    });
    expect(
      createChatRoomMessageHistoryFeedback({
        error: null,
        isActive: true,
        isError: false,
        isPending: true,
        messageCount: 0,
      }),
    ).toEqual({
      kind: "notice",
      message: "최근 메시지를 불러오고 있습니다.",
    });
  });

  it("오류, 빈 이력과 정상 메시지 상태를 구분한다", () => {
    expect(
      createChatRoomMessageHistoryFeedback({
        error: new Error("history failed"),
        isActive: true,
        isError: true,
        isPending: false,
        messageCount: 0,
      }),
    ).toEqual({
      kind: "error",
      message: "history failed",
      title: "메시지 이력을 불러오지 못했습니다.",
    });
    expect(
      createChatRoomMessageHistoryFeedback({
        error: null,
        isActive: true,
        isError: false,
        isPending: false,
        messageCount: 0,
      }),
    ).toEqual({
      kind: "notice",
      message: "아직 작성된 메시지가 없습니다.",
    });
    expect(
      createChatRoomMessageHistoryFeedback({
        error: null,
        isActive: true,
        isError: false,
        isPending: false,
        messageCount: 1,
      }),
    ).toBeNull();
  });

  it("알 수 없는 오류에는 공통 fallback 문구를 사용한다", () => {
    expect(toChatRoomErrorMessage("unknown")).toBe("알 수 없는 오류가 발생했습니다.");
  });
});
