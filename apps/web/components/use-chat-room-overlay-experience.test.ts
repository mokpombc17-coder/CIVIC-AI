import { describe, expect, it } from "vitest";
import { createChatRoomOverlayExperienceState } from "./use-chat-room-overlay-experience";

describe("chat room overlay experience", () => {
  it("검색, 멤버십, 메시지 액션 순서로 단일 overlay를 선택한다", () => {
    expect(
      createChatRoomOverlayExperienceState({
        hasMessageActions: true,
        isMembershipDialogOpen: true,
        isMessageSearchDialogOpen: true,
        roomActive: true,
        roomAvailable: true,
      }),
    ).toMatchObject({
      kind: "message-search",
      searchDisabled: false,
    });

    expect(
      createChatRoomOverlayExperienceState({
        hasMessageActions: true,
        isMembershipDialogOpen: true,
        isMessageSearchDialogOpen: false,
        roomActive: true,
        roomAvailable: true,
      }).kind,
    ).toBe("membership");

    expect(
      createChatRoomOverlayExperienceState({
        hasMessageActions: true,
        isMembershipDialogOpen: false,
        isMessageSearchDialogOpen: false,
        roomActive: true,
        roomAvailable: true,
      }).kind,
    ).toBe("message-actions");
  });

  it("Room이 없으면 dialog를 숨기고 비활성 session에서는 검색을 막는다", () => {
    expect(
      createChatRoomOverlayExperienceState({
        hasMessageActions: false,
        isMembershipDialogOpen: true,
        isMessageSearchDialogOpen: true,
        roomActive: false,
        roomAvailable: false,
      }),
    ).toEqual({
      kind: null,
      roomAvailable: false,
      searchDisabled: true,
    });
  });
});
