import { describe, expect, it } from "vitest";
import { createChatRoomOverlayExperienceState } from "./use-chat-room-overlay-experience";

describe("chat room overlay experience", () => {
  it("검색 panel은 별도로 노출하고 멤버십과 메시지 액션만 overlay로 선택한다", () => {
    expect(
      createChatRoomOverlayExperienceState({
        hasMessageActions: true,
        isMembershipDialogOpen: true,
        isMessageSearchPanelOpen: true,
        roomActive: true,
        roomAvailable: true,
      }),
    ).toMatchObject({
      kind: "membership",
      searchDisabled: false,
      searchPanelVisible: true,
    });

    expect(
      createChatRoomOverlayExperienceState({
        hasMessageActions: true,
        isMembershipDialogOpen: true,
        isMessageSearchPanelOpen: false,
        roomActive: true,
        roomAvailable: true,
      }).kind,
    ).toBe("membership");

    expect(
      createChatRoomOverlayExperienceState({
        hasMessageActions: true,
        isMembershipDialogOpen: false,
        isMessageSearchPanelOpen: false,
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
        isMessageSearchPanelOpen: true,
        roomActive: false,
        roomAvailable: false,
      }),
    ).toEqual({
      kind: null,
      roomAvailable: false,
      searchDisabled: true,
      searchPanelVisible: false,
    });
  });
});
