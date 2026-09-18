import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CHAT_ROOM_LOADING_SPINNER_DELAY_MS } from "./chat-room-loading-spinner";
import { ChatRoomScreenLoading } from "./chat-room-screen-loading";

vi.mock("next/navigation", () => ({
  usePathname: () => "/chat/room-01",
}));

describe("ChatRoomScreenLoading", () => {
  it("메시지 bubble 없이 채팅방 상세 전용 loading surface를 표시한다", () => {
    const markup = renderToStaticMarkup(<ChatRoomScreenLoading />);

    expect(markup).toContain('data-platform-shell="true"');
    expect(markup).toContain('href="/chat"');
    expect(markup).toContain(">토론방</h1>");
    expect(markup).toContain('data-chat-room-screen-loading="true"');
    expect(markup).toContain('data-chat-room-composer-skeleton="true"');
    expect(markup).toContain('data-chat-room-loading-spinner="true"');
    expect(markup).toContain(`data-delay-ms="${CHAT_ROOM_LOADING_SPINNER_DELAY_MS}"`);
    expect(markup).toContain('data-visible="false"');
    expect(markup).toContain("opacity-0");
    expect(markup).not.toContain('data-chat-room-card-skeleton="true"');
    expect(markup).not.toContain('data-message-viewport="true"');
  });
});
