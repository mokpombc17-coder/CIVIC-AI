import { describe, expect, it } from "vitest";
import { getChatRoomComposerPresentation } from "./chat-room-session-controls";

describe("chat room composer presentation", () => {
  it("최초 준비와 짧은 연결 전환에는 별도 입력 안내를 노출하지 않는다", () => {
    expect(getChatRoomComposerPresentation({ canDraft: false, kind: "pending" })).toEqual({
      disabledMessage: null,
      placeholder: "메시지를 입력해 주세요.",
    });
  });

  it("종료된 방처럼 지속되는 상태에는 비활성 사유를 표시한다", () => {
    expect(getChatRoomComposerPresentation({ canDraft: false, kind: "closed" })).toEqual({
      disabledMessage: "종료된 채팅방에는 메시지를 보낼 수 없습니다.",
      placeholder: "종료된 채팅방에는 메시지를 보낼 수 없습니다.",
    });
  });
});
