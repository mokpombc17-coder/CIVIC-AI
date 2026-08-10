import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ChatRoomEntryNavigationNotice,
  createChatRoomEntryNavigationNotice,
} from "./chat-room-entry-navigation-notice";

describe("ChatRoomEntryNavigationNotice", () => {
  it("자동 탐색 중인 상태를 접근 가능한 status로 안내한다", () => {
    const markup = renderToStaticMarkup(
      <ChatRoomEntryNavigationNotice
        notice={{
          kind: "loading",
          message: "마지막으로 읽은 위치를 찾고 있습니다…",
        }}
      />,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain("마지막으로 읽은 위치를 찾고 있습니다…");
    expect(markup).not.toContain("<button");
  });

  it("수동 계속 탐색 동작을 button으로 제공한다", () => {
    const markup = renderToStaticMarkup(
      <ChatRoomEntryNavigationNotice
        notice={{
          actionLabel: "읽은 위치로 계속 이동",
          kind: "action",
          message: "마지막으로 읽은 위치가 더 이전에 있습니다.",
          onAction: vi.fn(),
        }}
      />,
    );

    expect(markup).toContain("마지막으로 읽은 위치가 더 이전에 있습니다.");
    expect(markup).toContain("읽은 위치로 계속 이동");
    expect(markup).toContain('type="button"');
  });

  it("탐색 복구 상태를 사용자 동작 안내로 변환한다", () => {
    const continueToReadPosition = vi.fn();
    const notice = createChatRoomEntryNavigationNotice({
      canReportReadState: false,
      continueToReadPosition,
      initialScrollTarget: { kind: "pending" },
      key: "room-a:3",
      readBoundaryAfterSequence: null,
      recovery: "retry",
      status: "error",
    });

    expect(notice).toEqual({
      actionLabel: "읽은 위치 다시 찾기",
      kind: "action",
      message: "마지막으로 읽은 위치를 찾지 못했습니다.",
      onAction: continueToReadPosition,
    });
  });
});
