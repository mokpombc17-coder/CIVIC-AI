import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatRoomScreenHeaderActions } from "./chat-room-screen-overlays";
import { resolveChatRoomScreenOverlayKind } from "./chat-room-screen-overlay-model";

describe("ChatRoomScreen overlay presentation", () => {
  it("Room이 준비되면 검색과 방 정보 trigger를 렌더링한다", () => {
    const markup = renderToStaticMarkup(
      <ChatRoomScreenHeaderActions
        isMembershipDialogOpen={false}
        isMessageSearchDialogOpen={false}
        membershipDialogTriggerRef={{ current: null }}
        messageSearchDialogTriggerRef={{ current: null }}
        onOpenMembershipDialog={vi.fn()}
        onOpenMessageSearchDialog={vi.fn()}
        roomAvailable
        searchDisabled
      />,
    );

    expect(markup).toContain("메시지 검색");
    expect(markup).toContain("방 정보");
    expect(markup).toContain("disabled");
  });

  it("Room이 준비되지 않으면 header action을 표시하지 않는다", () => {
    expect(
      renderToStaticMarkup(
        <ChatRoomScreenHeaderActions
          isMembershipDialogOpen={false}
          isMessageSearchDialogOpen={false}
          membershipDialogTriggerRef={{ current: null }}
          messageSearchDialogTriggerRef={{ current: null }}
          onOpenMembershipDialog={vi.fn()}
          onOpenMessageSearchDialog={vi.fn()}
          roomAvailable={false}
          searchDisabled
        />,
      ),
    ).toBe("");
  });

  it("검색, 참여자, 메시지 action 순서로 단일 overlay 우선순위를 결정한다", () => {
    expect(
      resolveChatRoomScreenOverlayKind({
        hasMessageActions: true,
        isMembershipDialogOpen: true,
        isMessageSearchDialogOpen: true,
        roomAvailable: true,
      }),
    ).toBe("message-search");
    expect(
      resolveChatRoomScreenOverlayKind({
        hasMessageActions: true,
        isMembershipDialogOpen: true,
        isMessageSearchDialogOpen: false,
        roomAvailable: true,
      }),
    ).toBe("membership");
    expect(
      resolveChatRoomScreenOverlayKind({
        hasMessageActions: true,
        isMembershipDialogOpen: true,
        isMessageSearchDialogOpen: true,
        roomAvailable: false,
      }),
    ).toBe("message-actions");
    expect(
      resolveChatRoomScreenOverlayKind({
        hasMessageActions: false,
        isMembershipDialogOpen: false,
        isMessageSearchDialogOpen: false,
        roomAvailable: true,
      }),
    ).toBeNull();
  });
});
