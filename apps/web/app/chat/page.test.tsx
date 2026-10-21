import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ChatPage from "./page";

vi.mock("@/components/chat/chat-room-list-screen", () => ({
  ChatRoomListScreen: ({
    initialParticipatingRoomFilter,
  }: {
    initialParticipatingRoomFilter: string;
  }) => <div data-initial-filter={initialParticipatingRoomFilter} />,
}));

describe("ChatPage", () => {
  it("안읽음 query를 목록 screen의 초기값으로 전달한다", async () => {
    const page = await ChatPage({ searchParams: Promise.resolve({ filter: "unread" }) });

    expect(renderToStaticMarkup(page)).toContain('data-initial-filter="UNREAD"');
  });

  it("유효하지 않은 filter query는 전체로 정규화한다", async () => {
    const page = await ChatPage({ searchParams: Promise.resolve({ filter: "unknown" }) });

    expect(renderToStaticMarkup(page)).toContain('data-initial-filter="ALL"');
  });
});
