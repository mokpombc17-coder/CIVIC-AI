import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ChatLayout from "./layout";

vi.mock("next/navigation", () => ({
  usePathname: () => "/chat/01011",
}));

describe("ChatLayout", () => {
  it("eligibility 확인 전에는 하위 화면과 realtime provider를 시작하지 않는다", () => {
    const markup = renderToStaticMarkup(<ChatLayout>protected chat content</ChatLayout>);

    expect(markup.match(/data-chat-room-list-state="loading"/g)).toHaveLength(2);
    expect(markup).toContain('data-header-size="compact"');
    expect(markup).not.toContain("protected chat content");
    expect(markup).not.toContain("data-chat-realtime-provider");
  });
});
