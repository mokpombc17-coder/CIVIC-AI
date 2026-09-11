import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { RoomDetails } from "@/lib/chat/chat-room-contracts";
import { ChatRoomMembershipDialog } from "./chat-room-membership-dialog";

vi.mock("@/components/chat-room-membership-panel", () => ({
  ChatRoomMembershipPanel: ({
    headerAction,
    headingId,
  }: {
    headerAction: ReactNode;
    headingId: string;
  }) => (
    <section aria-labelledby={headingId} className="panel">
      <h2 id={headingId}>채팅방 메뉴</h2>
      {headerAction}
    </section>
  ),
}));

describe("ChatRoomMembershipDialog", () => {
  it("채팅방 메뉴를 platform bottom sheet로 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <ChatRoomMembershipDialog onClose={vi.fn()} room={{} as RoomDetails} roomId="room-01" />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('data-chat-room-membership-bottom-sheet="true"');
    expect(html).toContain("rounded-t-[20px]");
    expect(html).toContain("mx-auto mt-2 h-1 w-10 rounded-full");
    expect(html).toContain("max-w-[393px]");
    expect(html).toContain("overflow-x-hidden");
    expect(html).toContain('aria-label="채팅방 메뉴 닫기"');
    expect(html).toContain("close.png");
  });
});
