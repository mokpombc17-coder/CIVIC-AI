import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ChatRoomEntryNavigationNotice,
  createChatRoomEntryNavigationNotice,
} from "./chat-room-entry-navigation-notice";

describe("ChatRoomEntryNavigationNotice", () => {
  it("읽은 위치를 찾는 중인 상태를 접근 가능한 status로 안내한다", () => {
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

  it("다시 찾기 동작을 button으로 제공한다", () => {
    const markup = renderToStaticMarkup(
      <ChatRoomEntryNavigationNotice
        notice={{
          actionLabel: "읽은 위치 다시 찾기",
          kind: "action",
          message: "마지막으로 읽은 위치를 찾지 못했습니다.",
          onAction: vi.fn(),
        }}
      />,
    );

    expect(markup).toContain("마지막으로 읽은 위치를 찾지 못했습니다.");
    expect(markup).toContain("읽은 위치 다시 찾기");
    expect(markup).toContain('type="button"');
  });

  it("탐색 복구 상태를 사용자 동작 안내로 변환한다", () => {
    const retryReadPosition = vi.fn();
    const notice = createChatRoomEntryNavigationNotice({
      canReportReadState: false,
      initialScrollTarget: { kind: "latest" },
      jumpMessageId: null,
      key: "room-a:3",
      readBoundaryAfterSequence: null,
      recovery: "retry",
      retryReadPosition,
      status: "error",
    });

    expect(notice).toEqual({
      actionLabel: "읽은 위치 다시 찾기",
      kind: "action",
      message: "마지막으로 읽은 위치를 찾지 못했습니다.",
      onAction: retryReadPosition,
    });
  });
});
