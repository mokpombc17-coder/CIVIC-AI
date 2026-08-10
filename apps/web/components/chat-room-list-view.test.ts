import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PublicRoomListItem, RoomInboxListItem } from "@/lib/chat/chat-room-contracts";
import { MyRoomCard, PublicRoomCard } from "./chat-room-list-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("chat room list cards", () => {
  it("참여 Room card에 ACTIVE preview, last activity와 unread badge를 표시한다", () => {
    const html = renderToStaticMarkup(
      createElement(MyRoomCard, {
        now: new Date("2026-08-04T12:00:00Z"),
        room: createRoomInboxItem(),
      }),
    );

    expect(html).toContain("프로젝트 회의방");
    expect(html).toContain("지역 현안");
    expect(html).toContain("다음 회의는 월요일입니다.");
    expect(html).toContain("오후 5:30");
    expect(html).toContain('dateTime="2026-08-04T08:30:00Z"');
    expect(html).toContain('aria-label="읽지 않은 메시지 4개"');
    expect(html).toContain("MEMBER · 참여자 5명");
  });

  it("truncated preview에 말줄임표를 표시한다", () => {
    const room = createRoomInboxItem({
      lastMessage: {
        ...createActiveLastMessage(),
        preview: "다음 회의는 월요일",
        previewTruncated: true,
      },
    });

    expect(renderMyRoomCard(room)).toContain("다음 회의는 월요일…");
  });

  it("삭제된 latest message와 lastMessage null을 구분해 표시한다", () => {
    const deleted = createRoomInboxItem({
      lastMessage: {
        ...createActiveLastMessage(),
        state: "DELETED_BY_AUTHOR",
        preview: null,
        previewTruncated: false,
      },
    });
    const withoutVisibleMessage = createRoomInboxItem({ lastMessage: null });

    expect(renderMyRoomCard(deleted)).toContain("삭제된 메시지입니다.");
    expect(renderMyRoomCard(withoutVisibleMessage)).toContain("표시할 메시지가 없습니다.");
  });

  it("unreadCount가 0이면 badge를 숨긴다", () => {
    const html = renderMyRoomCard(createRoomInboxItem({ unreadCount: 0 }));

    expect(html).not.toContain("읽지 않은 메시지");
  });

  it("public Room card는 description과 생성 정보를 유지한다", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(PublicRoomCard, { room: PUBLIC_ROOM }),
      ),
    );

    expect(html).toContain("공개 채팅방 설명");
    expect(html).toContain("정책");
    expect(html).toContain("방 ID: room-public");
    expect(html).toContain("참여자 3명");
    expect(html).toContain("생성");
  });
});

const PUBLIC_ROOM: PublicRoomListItem = {
  roomId: "room-public",
  name: "공개 채팅방",
  description: "공개 채팅방 설명",
  categories: ["POLICY"],
  ownerMembershipId: "membership-owner",
  status: "ACTIVE",
  visibility: "LISTED",
  joinPolicy: "INVITE_ONLY",
  activeMemberCount: 3,
  createdAt: "2026-07-29T04:30:00Z",
  version: 1,
};

function renderMyRoomCard(room: RoomInboxListItem): string {
  return renderToStaticMarkup(
    createElement(MyRoomCard, {
      now: new Date("2026-08-04T12:00:00Z"),
      room,
    }),
  );
}

function createRoomInboxItem(patch: Partial<RoomInboxListItem> = {}): RoomInboxListItem {
  return {
    roomId: "room-01",
    name: "프로젝트 회의방",
    description: "기존 설명",
    categories: ["LOCAL_ISSUE"],
    ownerMembershipId: "membership-owner",
    status: "ACTIVE",
    visibility: "LISTED",
    joinPolicy: "OPEN",
    activeMemberCount: 5,
    createdAt: "2026-07-29T04:30:00Z",
    version: 7,
    membershipId: "membership-01",
    membershipRole: "MEMBER",
    membershipStatus: "ACTIVE",
    joinedAt: "2026-07-30T04:30:00Z",
    membershipVersion: 2,
    readThroughSequence: 80,
    unreadCount: 4,
    unreadCountCapped: false,
    lastMessage: createActiveLastMessage(),
    lastActivityAt: "2026-08-04T08:30:00Z",
    ...patch,
  };
}

function createActiveLastMessage(): Extract<
  NonNullable<RoomInboxListItem["lastMessage"]>,
  { state: "ACTIVE" }
> {
  return {
    messageId: "message-101",
    roomSequence: 101,
    messageVersion: 2,
    state: "ACTIVE",
    preview: "다음 회의는 월요일입니다.",
    previewTruncated: false,
    createdAt: "2026-08-04T08:30:00Z",
  };
}
