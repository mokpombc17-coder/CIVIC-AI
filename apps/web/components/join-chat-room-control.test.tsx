import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicRoomListItem } from "@/lib/chat/chat-room-contracts";
import { JoinChatRoomControl } from "./join-chat-room-control";

const useJoinChatRoomMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/use-join-chat-room", () => ({
  useJoinChatRoom: useJoinChatRoomMock,
}));

describe("JoinChatRoomControl", () => {
  beforeEach(() => {
    useJoinChatRoomMock.mockReturnValue({
      canRetry: true,
      errorMessage: "네트워크 연결을 확인해 주세요.",
      isOpen: true,
      isPending: false,
      join: vi.fn(),
      retry: vi.fn(),
    });
  });

  it("참여 실패와 동일 요청 재시도를 주의 피드백으로 표시한다", () => {
    const html = renderToStaticMarkup(<JoinChatRoomControl appearance="sheet" room={ROOM} />);

    expect(html).toContain('data-chat-form-feedback="request-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("네트워크 연결을 확인해 주세요.");
    expect(html).toContain("같은 요청으로 다시 시도");
    expect(html).toContain("bg-[#fff7e8]");
    expect(html).toContain("w-full bg-[var(--chat-publishing-color-primary)]");
    expect(html).not.toContain("w-fit bg-[var(--chat-publishing-color-primary)]");
    expect(html).not.toContain("text-red-700");
    expect(html.indexOf('data-chat-form-feedback="request-error"')).toBeLessThan(
      html.indexOf(">참여하기</button>"),
    );
  });
});

const ROOM = {
  activeMemberCount: 3,
  categoryIds: ["00000000-0000-4000-8000-000000000001"],
  categorySummaries: [{ categoryId: "00000000-0000-4000-8000-000000000001", name: "정책" }],
  createdAt: "2026-08-28T00:00:00Z",
  description: "공개 채팅방 설명",
  joinPolicy: "OPEN",
  name: "공개 채팅방",
  ownerMembershipId: "membership-owner",
  roomId: "room-public",
  status: "ACTIVE",
  version: 1,
  visibility: "LISTED",
} satisfies PublicRoomListItem;
