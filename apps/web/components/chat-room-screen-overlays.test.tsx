import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatRoomScreenHeaderActions } from "./chat-room-screen-overlays";
import { resolveChatRoomScreenOverlayKind } from "./chat-room-screen-overlay-model";

describe("ChatRoomScreen overlay presentation", () => {
  it("Room이 준비되면 검색과 채팅방 메뉴 아이콘 trigger를 렌더링한다", () => {
    const markup = renderToStaticMarkup(
      <ChatRoomScreenHeaderActions
        isMembershipDialogOpen={false}
        isMessageSearchPanelOpen={false}
        membershipDialogTriggerRef={{ current: null }}
        messageSearchPanelTriggerRef={{ current: null }}
        onOpenMembershipDialog={vi.fn()}
        onOpenMessageSearchPanel={vi.fn()}
        roomAvailable
        searchDisabled
      />,
    );
    const searchTrigger = /<button[^>]*aria-controls="chat-room-message-search-panel"[^>]*>/.exec(
      markup,
    )?.[0];

    expect(markup).toContain('aria-label="메시지 검색"');
    expect(markup).toContain('aria-controls="chat-room-message-search-panel"');
    expect(searchTrigger).toBeDefined();
    expect(searchTrigger).not.toContain('aria-haspopup="dialog"');
    expect(markup).toContain("search.png");
    expect(markup).toContain('aria-label="채팅방 메뉴"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("disabled");
  });

  it("Room이 준비되지 않으면 header action을 표시하지 않는다", () => {
    expect(
      renderToStaticMarkup(
        <ChatRoomScreenHeaderActions
          isMembershipDialogOpen={false}
          isMessageSearchPanelOpen={false}
          membershipDialogTriggerRef={{ current: null }}
          messageSearchPanelTriggerRef={{ current: null }}
          onOpenMembershipDialog={vi.fn()}
          onOpenMessageSearchPanel={vi.fn()}
          roomAvailable={false}
          searchDisabled
        />,
      ),
    ).toBe("");
  });

  it("검색과 별개로 참여자, 메시지 action 순서의 blocking overlay를 결정한다", () => {
    expect(
      resolveChatRoomScreenOverlayKind({
        hasMessageActions: true,
        isMembershipDialogOpen: true,
        roomAvailable: true,
      }),
    ).toBe("membership");
    expect(
      resolveChatRoomScreenOverlayKind({
        hasMessageActions: true,
        isMembershipDialogOpen: true,
        roomAvailable: true,
      }),
    ).toBe("membership");
    expect(
      resolveChatRoomScreenOverlayKind({
        hasMessageActions: true,
        isMembershipDialogOpen: true,
        roomAvailable: false,
      }),
    ).toBe("message-actions");
    expect(
      resolveChatRoomScreenOverlayKind({
        hasMessageActions: false,
        isMembershipDialogOpen: false,
        roomAvailable: true,
      }),
    ).toBeNull();
  });
});
