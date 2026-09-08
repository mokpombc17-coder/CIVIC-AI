import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatRoomListLoading } from "./chat-room-list-loading";

vi.mock("next/navigation", () => ({
  usePathname: () => "/chat",
}));

describe("ChatRoomListLoading", () => {
  it("채팅 목록과 같은 shell 안에 두 목록의 skeleton을 표시한다", () => {
    const markup = renderToStaticMarkup(<ChatRoomListLoading />);

    expect(markup).toContain('data-platform-shell="true"');
    expect(markup).toContain('data-header-size="compact"');
    expect(markup).toContain('href="/home"');
    expect(markup).toContain("토론방");
    expect(markup.match(/data-chat-room-list-state="loading"/g)).toHaveLength(2);
    expect(markup.match(/data-chat-room-card-skeleton="true"/g)).toHaveLength(5);
    expect(markup).toContain("참여 중인 방을 불러오고 있습니다.");
    expect(markup).toContain("공개 방을 불러오고 있습니다.");
  });
});
