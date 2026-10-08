import { describe, expect, it } from "vitest";
import { getChatRoomComposerPresentation } from "./chat-room-session-controls";

describe("chat room composer presentation", () => {
  it("일반 준비 상태에서는 입력창 외형만 유지하고 입력을 막는다", () => {
    expect(getChatRoomComposerPresentation({ canCompose: false, kind: "pending" })).toEqual({
      disabledAppearance: "stable",
      disabledMessage: null,
      placeholder: "채팅을 사용할 수 없습니다.",
    });
  });

  it("토론방 자동 전환 중에는 메시지 작성을 허용한다", () => {
    expect(getChatRoomComposerPresentation({ canCompose: true, kind: "pending" })).toEqual({
      disabledAppearance: "stable",
      disabledMessage: null,
      placeholder: "메시지를 입력해 주세요.",
    });
  });

  it("종료된 방에서도 입력창의 비활성 문구를 동일하게 표시한다", () => {
    expect(getChatRoomComposerPresentation({ canCompose: false, kind: "closed" })).toEqual({
      disabledAppearance: "muted",
      disabledMessage: null,
      placeholder: "채팅을 사용할 수 없습니다.",
    });
  });

  it("다른 토론방으로 완전히 전환되면 컴포저 전체를 비활성화한다", () => {
    expect(getChatRoomComposerPresentation({ canCompose: false, kind: "replaced" })).toEqual({
      disabledAppearance: "muted",
      disabledMessage: null,
      placeholder: "채팅을 사용할 수 없습니다.",
    });
  });
});
