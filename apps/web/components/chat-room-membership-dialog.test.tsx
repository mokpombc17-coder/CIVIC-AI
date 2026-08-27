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
      <h2 id={headingId}>방 정보와 멤버십</h2>
      {headerAction}
    </section>
  ),
}));

describe("ChatRoomMembershipDialog", () => {
  it("방 정보와 관리 내용을 platform bottom sheet로 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <ChatRoomMembershipDialog onClose={vi.fn()} room={{} as RoomDetails} roomId="room-01" />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('data-chat-room-membership-bottom-sheet="true"');
    expect(html).toContain("rounded-t-xl");
    expect(html).toContain('aria-label="방 정보와 멤버십 닫기"');
    expect(html).toContain("close.png");
  });
});
