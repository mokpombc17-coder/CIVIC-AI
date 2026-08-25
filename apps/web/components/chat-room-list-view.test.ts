import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PublicRoomSearchController } from "@/components/use-public-room-search";
import type { PublicRoomListItem, RoomInboxListItem } from "@/lib/chat/chat-room-contracts";
import { ChatRoomListView, MyRoomCard, PublicRoomCard } from "./chat-room-list-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/chat-connection-status", () => ({
  ChatConnectionStatus: () => null,
}));

describe("chat room list publishing layout", () => {
  it("모바일 토론방 header, 검색·생성 도구와 두 Room section을 조립한다", () => {
    const emptyListState = {
      error: null,
      hasNextPage: false,
      isError: false,
      isFetchingNextPage: false,
      isPending: false,
      loadMore: vi.fn(),
      retry: vi.fn(),
      rooms: [],
    };
    const html = renderToStaticMarkup(
      createElement(ChatRoomListView, {
        closeCreateRoomForm: vi.fn(),
        createRoomTriggerRef: { current: null },
        isCreateRoomOpen: false,
        participatingRooms: emptyListState,
        publicRoomSearch: createPublicRoomSearchController(),
        publicRooms: emptyListState,
        toggleCreateRoomForm: vi.fn(),
      }),
    );

    expect(html).toContain(">토론방</h1>");
    expect(html).toContain('aria-label="채팅방 검색과 생성"');
    expect(html).toContain(">채팅방 생성</button>");
    expect(html).toContain(">참여한 방</h2>");
    expect(html).toContain(">참여 가능한 방</h2>");
    expect(html).toContain("참여 가능한 방이 없습니다.");
    expect(html).not.toContain("Chat Resource Server");
  });
});

describe("chat room list cards", () => {
  it("참여 Room card에 category, 제목, 정원·unread와 상세 action을 표시한다", () => {
    const html = renderMyRoomCard(createRoomInboxItem());

    expect(html).toContain("프로젝트 회의방");
    expect(html).toContain("지역 현안");
    expect(html).toContain("5 / 50명 · 읽지 않음 4");
    expect(html).toContain('aria-label="현재 참여 인원 5명, 최대 50명, 읽지 않은 메시지 4개"');
    expect(html).toContain("자세히 보기");
    expect(html).not.toContain("다음 회의는 월요일입니다.");
  });

  it("capped unread count는 inline metadata에서도 상한 표시를 유지한다", () => {
    const html = renderMyRoomCard(
      createRoomInboxItem({ unreadCount: 99, unreadCountCapped: true }),
    );

    expect(html).toContain("5 / 50명 · 읽지 않음 99+");
    expect(html).toContain("읽지 않은 메시지 99개 이상");
  });

  it("unreadCount가 0이면 badge를 숨긴다", () => {
    const html = renderMyRoomCard(createRoomInboxItem({ unreadCount: 0 }));

    expect(html).not.toContain("읽지 않은 메시지");
  });

  it("참여 가능 Room card는 category, 제목, 정원과 실제 참여 action만 표시한다", () => {
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

    expect(html).toContain("정책");
    expect(html).toContain("공개 채팅방");
    expect(html).toContain("3 / 50명");
    expect(html).toContain('aria-label="현재 참여 인원 3명, 최대 50명"');
    expect(html).toContain("참여하기");
    expect(html).not.toContain("공개 채팅방 설명");
    expect(html).not.toContain("방 ID: room-public");
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
  joinPolicy: "OPEN",
  activeMemberCount: 3,
  createdAt: "2026-07-29T04:30:00Z",
  version: 1,
};

function createPublicRoomSearchController(): PublicRoomSearchController {
  return {
    appliedQuery: undefined,
    applySearch: vi.fn(),
    category: undefined,
    draftQuery: "",
    endComposition: vi.fn(),
    isComposing: false,
    setCategory: vi.fn(),
    setDraftQuery: vi.fn(),
    startComposition: vi.fn(),
    validationMessage: undefined,
  };
}

function renderMyRoomCard(room: RoomInboxListItem): string {
  return renderToStaticMarkup(createElement(MyRoomCard, { room }));
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
