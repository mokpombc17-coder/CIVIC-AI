import { describe, expect, it } from "vitest";
import { getChatRoomComposerPresentation } from "./chat-room-session-controls";

describe("chat room composer presentation", () => {
  it("최초 준비와 짧은 연결 전환에는 별도 입력 안내를 노출하지 않는다", () => {
    expect(getChatRoomComposerPresentation({ canDraft: false, kind: "pending" })).toEqual({
      disabledAppearance: "stable",
      disabledMessage: null,
      placeholder: "채팅을 사용할 수 없습니다.",
    });
  });

  it("종료된 방에서도 입력창의 비활성 문구를 동일하게 표시한다", () => {
    expect(getChatRoomComposerPresentation({ canDraft: false, kind: "closed" })).toEqual({
      disabledAppearance: "muted",
      disabledMessage: null,
      placeholder: "채팅을 사용할 수 없습니다.",
    });
  });

  it("같은 브라우저의 토론방 자동 전환 중에는 입력창 외형과 문구를 유지한다", () => {
    expect(getChatRoomComposerPresentation({ canDraft: false, kind: "replaced" })).toEqual({
      disabledAppearance: "stable",
      disabledMessage: null,
      placeholder: "채팅을 사용할 수 없습니다.",
    });
  });
});
