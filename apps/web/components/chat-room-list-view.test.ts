import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PublicRoomSearchController } from "@/components/use-public-room-search";
import type { PublicRoomListItem, RoomInboxListItem } from "@/lib/chat/chat-room-contracts";
import { ChatRoomListDetailDialog } from "./chat-room-list-detail-dialog";
import { ChatRoomListView, MyRoomCard, PublicRoomCard } from "./chat-room-list-view";

vi.mock("next/navigation", () => ({
  usePathname: () => "/chat",
  useRouter: () => ({ push: vi.fn() }),
}));

describe("chat room list publishing layout", () => {
  it("모바일 토론방 header, 검색·생성 도구와 두 Room section을 조립한다", () => {
    const html = renderChatRoomListView("ALL");

    expect(html).toContain(">토론방</h1>");
    expect(html).toContain('aria-label="채팅방 검색과 생성"');
    expect(html).toContain('aria-label="참여한 방 필터"');
    expect(html).toContain(">채팅방 생성 요청</button>");
    expect(html).toContain(">참여한 방</h2>");
    expect(html).toContain(">참여 가능한 방</h2>");
    expect(html).toContain("참여 가능한 방이 없습니다.");
    expect(html.match(/data-chat-room-list-state="empty"/g)).toHaveLength(2);
    expect(html).toContain("bg-[var(--chat-publishing-color-neutral-soft)]");
    expect(html).not.toContain("border-dashed");
    expect(html).not.toContain("border-slate-300");
    expect(html).toContain('data-platform-shell="true"');
    expect(html.match(/data-scroll="self"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="참여자 주요 메뉴"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/home"');
    expect(html).toContain('href="/rag"');
    expect(html).toContain('aria-current="page" href="/chat"');
    expect(html).toContain('href="/vote"');
    expect(html).toContain('href="/mypage"');
    expect(html).toContain(">AI</span>");
    expect(html).toContain(">계정</span>");
    expect(html).not.toContain("채팅방 생성 신청 내역");
    expect(html).not.toContain("Chat Resource Server");
  });

  it("목록 조회 오류와 로딩 상태를 publishing token 기반 상태 카드로 표시한다", () => {
    const errorHtml = renderChatRoomListView("ALL", false, "error");
    const loadingHtml = renderChatRoomListView("ALL", false, "loading");

    expect(errorHtml.match(/data-chat-room-list-state="error"/g)).toHaveLength(2);
    expect(errorHtml).toContain("참여 중인 방을 불러오지 못했습니다.");
    expect(errorHtml).toContain("공개 방을 불러오지 못했습니다.");
    expect(errorHtml.match(/>다시 불러오기<\/button>/g)).toHaveLength(2);
    expect(errorHtml).toContain("bg-[#fff7e8]");
    expect(errorHtml).not.toContain("secondary-button");
    expect(errorHtml).not.toContain("bg-red-50");
    expect(loadingHtml.match(/data-chat-room-list-state="loading"/g)).toHaveLength(2);
    expect(loadingHtml.match(/role="status"/g)).toHaveLength(2);
    expect(loadingHtml).toContain("bg-transparent");
    expect(loadingHtml).not.toContain("bg-[var(--chat-publishing-color-neutral-soft)]");
  });

  it("안읽음 filter 결과가 비면 현재 누적 목록 기준임을 안내한다", () => {
    const html = renderChatRoomListView("UNREAD");

    expect(html).toContain("불러온 방 중 읽지 않은 메시지가 있는 방이 없습니다.");
    expect(html).toContain('aria-pressed="true"');
  });

  it("생성 요청이 열리면 PlatformShell overlay로 sheet를 조립하고 본문을 비활성화한다", () => {
    const html = renderChatRoomListView("ALL", true);

    expect(html).toContain('data-platform-shell-overlay="true"');
    expect(html).toContain('data-create-chat-room-sheet="form"');
    expect(html).toContain('inert=""');
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("chat room list cards", () => {
  it("참여 Room card에 category, 제목, 정원·unread 상태와 분리된 입장·상세 action을 표시한다", () => {
    const html = renderMyRoomCard(createRoomInboxItem());

    expect(html).toContain("프로젝트 회의방");
    expect(html).toContain("지역 현안");
    expect(html).not.toContain("다음 회의는 월요일입니다.");
    expect(html).toContain("읽지 않음 4");
    expect(html).toContain('aria-hidden="true">·</span>');
    expect(html).not.toContain("<time");
    expect(html).toContain("5 / 50명");
    expect(html).toContain('aria-label="읽지 않은 메시지 4개"');
    expect(html).toContain('aria-label="현재 참여 인원 5명, 최대 50명"');
    expect(html).toContain('aria-label="프로젝트 회의방 채팅방 입장"');
    expect(html).toContain('href="/chat/room-01"');
    expect(html).toContain("자세히 보기");
    expect(html).toContain('id="chat-room-list-detail-trigger-room-01"');
    expect(html.match(/cursor-pointer/g)).toHaveLength(2);
    expect(/<article class="([^"]+)"/.exec(html)?.[1]).not.toContain("hover:bg-");
  });

  it("마지막 메시지 상태와 관계없이 unread가 없으면 새 메시지 없음만 표시한다", () => {
    const emptyHtml = renderMyRoomCard(createRoomInboxItem({ lastMessage: null, unreadCount: 0 }));
    const deletedHtml = renderMyRoomCard(
      createRoomInboxItem({
        lastMessage: {
          messageId: "message-102",
          roomSequence: 102,
          messageVersion: 3,
          state: "DELETED_BY_AUTHOR",
          preview: null,
          previewTruncated: false,
          createdAt: "2026-08-04T08:30:00Z",
        },
        unreadCount: 0,
      }),
    );

    expect(emptyHtml).toContain("새 메시지 없음");
    expect(deletedHtml).toContain("새 메시지 없음");
    expect(emptyHtml).not.toContain("<time");
    expect(deletedHtml).not.toContain("<time");
    expect(emptyHtml).not.toContain("표시할 메시지가 없습니다.");
    expect(deletedHtml).not.toContain("삭제된 메시지입니다.");
  });

  it("capped unread count는 메시지 상태 문구에서도 상한 표시를 유지한다", () => {
    const html = renderMyRoomCard(
      createRoomInboxItem({ unreadCount: 99, unreadCountCapped: true }),
    );

    expect(html).toContain("읽지 않음 99+");
    expect(html).toContain("읽지 않은 메시지 99개 이상");
  });

  it("unreadCount가 0이면 새 메시지 없음을 표시한다", () => {
    const html = renderMyRoomCard(createRoomInboxItem({ unreadCount: 0 }));

    expect(html).not.toContain("읽지 않은 메시지");
    expect(html).toContain("새 메시지 없음");
  });

  it("참여 가능 Room card는 category, 제목, 정원과 상세 action만 표시한다", () => {
    const html = renderToStaticMarkup(
      createElement(PublicRoomCard, {
        isDetailOpen: false,
        onOpenDetails: vi.fn(),
        room: PUBLIC_ROOM,
      }),
    );

    expect(html).toContain("정책");
    expect(html).toContain("공개 채팅방");
    expect(html).toContain("3 / 50명");
    expect(html).toContain('aria-label="현재 참여 인원 3명, 최대 50명"');
    expect(html).toContain("자세히 보기");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('id="chat-room-list-detail-trigger-room-public"');
    expect(html.match(/cursor-pointer/g)).toHaveLength(1);
    expect(html).not.toContain("참여하기");
    expect(html).not.toContain("공개 채팅방 설명");
    expect(html).not.toContain("방 ID: room-public");
  });

  it("참여 가능 Room 상세 sheet에 전체 정보와 실제 참여 action을 표시한다", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(ChatRoomListDetailDialog, {
          onClose: vi.fn(),
          selection: { kind: "available", room: PUBLIC_ROOM },
        }),
      ),
    );

    expect(html).toContain('data-chat-room-list-detail-dialog="true"');
    expect(html).toContain("공개 채팅방 설명");
    expect(html).toContain("3 / 50명");
    expect(html).toContain("참여하기");
    expect(html).toContain('aria-label="채팅방 상세 닫기"');
  });

  it("참여 중인 Room 상세 sheet에는 join 대신 입장 action을 표시한다", () => {
    const html = renderToStaticMarkup(
      createElement(ChatRoomListDetailDialog, {
        onClose: vi.fn(),
        selection: { kind: "participating", room: createRoomInboxItem() },
      }),
    );

    expect(html).toContain('href="/chat/room-01"');
    expect(html).toContain("채팅방 입장");
    expect(html).not.toContain("참여하기");
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

function renderChatRoomListView(
  filter: "ALL" | "UNREAD",
  isCreateRoomOpen = false,
  listStatus: "empty" | "error" | "loading" = "empty",
): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const emptyListState = {
    error: listStatus === "error" ? new Error("목록 조회 실패") : null,
    hasNextPage: false,
    isError: listStatus === "error",
    isFetchingNextPage: false,
    isPending: listStatus === "loading",
    loadMore: vi.fn(),
    retry: vi.fn(),
    rooms: [],
  };

  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ChatRoomListView, {
        closeCreateRoomForm: vi.fn(),
        createRoomTriggerRef: { current: null },
        isCreateRoomOpen,
        participatingRoomFilter: { select: vi.fn(), value: filter },
        participatingRooms: emptyListState,
        publicRoomSearch: createPublicRoomSearchController(),
        publicRooms: emptyListState,
        roomDetail: { close: vi.fn(), open: vi.fn(), selection: null },
        toggleCreateRoomForm: vi.fn(),
      }),
    ),
  );
}

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
  return renderToStaticMarkup(
    createElement(MyRoomCard, {
      isDetailOpen: false,
      onOpenDetails: vi.fn(),
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
