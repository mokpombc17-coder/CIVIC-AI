import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PublicRoomSearchController } from "@/components/use-public-room-search";
import type { PublicRoomListItem, RoomInboxListItem } from "@/lib/chat/chat-room-contracts";
import { ChatApiError } from "@/lib/chat/chat-fetch";
import type { ChatRoomListDetailSelection } from "./chat-room-list-detail";
import { ChatRoomListDetailDialog } from "./chat-room-list-detail-dialog";
import { PlatformLoadMoreButton } from "./platform-shell";
import {
  ChatRoomListView,
  findFirstNewPublicRoomIndex,
  MyRoomCard,
  PublicRoomCard,
  scrollPublicRoomIntoView,
  shouldShowPublicRoomBottomGradient,
} from "./chat-room-list-view";

vi.mock("next/navigation", () => ({
  usePathname: () => "/chat",
  useRouter: () => ({ push: vi.fn() }),
}));

describe("chat room list publishing layout", () => {
  it("모바일 토론방 header와 참여·검색 영역을 Figma 순서로 조립한다", () => {
    const html = renderChatRoomListView("ALL");
    const emptyStateClassNames = [
      ...html.matchAll(/<div class="([^"]+)" data-chat-room-list-state="empty"/g),
    ].map((match) => match[1] ?? "");
    const filterIndex = html.indexOf('aria-label="참여한 방 필터"');
    const participatingRoomsIndex = html.indexOf(">참여한 방</h2>");
    const publicRoomSearchIndex = html.indexOf('aria-label="공개 채팅방 검색"');
    const availableRoomsIndex = html.indexOf(">참여 가능한 방</h2>");

    expect(html).toContain(">토론방</h1>");
    expect(html).toMatch(/aria-label="홈으로" class="[^"]+" data-state="enabled" href="\/home"/);
    expect(html).not.toContain('data-state="disabled"');
    expect(html).toContain('aria-label="참여한 방 필터와 토론방 생성 요청"');
    expect(html).toContain('aria-label="참여 가능한 토론방 검색과 목록"');
    expect(html).toContain('aria-label="참여한 방 필터"');
    expect(html).toContain(">토론방 생성 요청</button>");
    expect(html).toMatch(
      /<button[^>]*class="[^"]*cursor-pointer[^"]*"[^>]*>토론방 생성 요청<\/button>/,
    );
    expect(html).toMatch(
      /<button[^>]*class="[^"]*font-bold leading-5[^"]*"[^>]*>토론방 생성 요청<\/button>/,
    );
    expect(html).toContain('<h2 class="text-lg font-bold leading-[27px]">참여한 방</h2>');
    expect(html).toContain('<h2 class="text-lg font-bold leading-[27px]">참여 가능한 방</h2>');
    expect(html).toContain("아직 참여한 토론방이 없어요.");
    expect(html).toContain("관심 있는 주제를 찾아 다른 사람들과 생각을 나눠보세요.");
    expect(html).toContain('data-chat-room-list-empty-variant="no-participating-rooms"');
    expect(html).not.toContain("현재 참여 중인 방이 없습니다.");
    expect(filterIndex).toBeLessThan(participatingRoomsIndex);
    expect(participatingRoomsIndex).toBeLessThan(publicRoomSearchIndex);
    expect(publicRoomSearchIndex).toBeLessThan(availableRoomsIndex);
    expect(html).toContain("현재 참여 가능한 방이 없어요");
    expect(html).toContain("원하는 주제로 토론방 생성을 요청해 보세요.");
    expect(html).toContain('data-chat-room-list-empty-variant="no-available-rooms"');
    expect(html).toContain("-translate-y-6");
    expect(html.match(/data-chat-room-list-state="empty"/g)).toHaveLength(2);
    expect(emptyStateClassNames).toHaveLength(2);
    expect(emptyStateClassNames).toEqual(
      expect.arrayContaining([
        expect.stringContaining("min-h-[252px]"),
        expect.stringContaining("min-h-[384px]"),
      ]),
    );
    expect(emptyStateClassNames.every((className) => !className.includes("border"))).toBe(true);
    expect(emptyStateClassNames.every((className) => !className.includes("bg-"))).toBe(true);
    expect(html).not.toContain(">−</span>");
    expect(html).toContain('data-platform-shell="true"');
    expect(html.match(/data-scroll="self"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="참여자 주요 메뉴"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/home"');
    expect(html).toContain('href="/rag"');
    expect(html).toMatch(/aria-current="page"[^>]*href="\/chat"/);
    expect(html).toContain('href="/vote"');
    expect(html).toContain('href="/mypage"');
    expect(html).toContain(">AI</span>");
    expect(html).toContain(">계정</span>");
    expect(html).not.toContain("채팅방 생성 신청 내역");
    expect(html).not.toContain("Chat Resource Server");
  });

  it("공개 방 검색 결과가 비면 전체 목록의 빈 상태와 구분해 표시한다", () => {
    const html = renderChatRoomListView("ALL", false, "empty", null, "기후");

    expect(html).toContain("검색 결과가 없어요");
    expect(html).not.toContain("현재 참여 가능한 방이 없어요");
    expect(html).not.toContain("원하는 주제로 토론방 생성을 요청해 보세요.");
  });

  it("참여 가능한 토론방 한도에 도달했을 때만 참여한 방 제목 아래에 안내한다", () => {
    const availableHtml = renderChatRoomListView("ALL");
    const limitReachedHtml = renderChatRoomListView(
      "ALL",
      false,
      "empty",
      null,
      undefined,
      [],
      true,
    );

    expect(availableHtml).not.toContain("동시에 최대 20개까지");
    expect(limitReachedHtml).toContain("토론방은 동시에 최대 20개까지 참여할 수 있어요.");
    expect(limitReachedHtml).toContain("whitespace-nowrap");
    expect(limitReachedHtml).toContain("text-[var(--chat-publishing-color-muted)]");
  });

  it("더 보기 버튼은 로딩 문구가 바뀌어도 같은 폭을 유지하고 마지막 상태를 안내한다", () => {
    const idleHtml = renderToStaticMarkup(
      createElement(PlatformLoadMoreButton, {
        hasNextPage: true,
        isFetching: false,
        label: "공개 방 더 보기",
        onClick: vi.fn(),
      }),
    );
    const loadingHtml = renderToStaticMarkup(
      createElement(PlatformLoadMoreButton, {
        hasNextPage: true,
        isFetching: true,
        label: "공개 방 더 보기",
        onClick: vi.fn(),
      }),
    );
    const exhaustedHtml = renderToStaticMarkup(
      createElement(PlatformLoadMoreButton, {
        exhaustedLabel: "모든 토론방을 확인했어요.",
        hasNextPage: false,
        isFetching: false,
        label: "공개 방 더 보기",
        onClick: vi.fn(),
      }),
    );

    for (const html of [idleHtml, loadingHtml]) {
      expect(html).toContain("공개 방 더 보기");
      expect(html).toContain("불러오는 중…");
      expect(html).toContain("grid whitespace-nowrap");
      expect(html).toContain("text-sm font-medium");
      expect(html).not.toContain("text-sm font-bold");
      expect(html.match(/col-start-1 row-start-1/g)).toHaveLength(2);
    }
    expect(loadingHtml).toContain('aria-busy="true"');
    expect(loadingHtml).toContain("disabled");
    expect(exhaustedHtml).toContain('role="status"');
    expect(exhaustedHtml).toContain("모든 토론방을 확인했어요.");
  });

  it("새로 추가된 첫 공개 방을 찾아 모션 설정에 맞게 목록 안으로 이동한다", () => {
    const nextRoom = { ...PUBLIC_ROOM, roomId: "room-next" };
    const scrollIntoView = vi.fn();

    expect(
      findFirstNewPublicRoomIndex(new Set([PUBLIC_ROOM.roomId]), [PUBLIC_ROOM, nextRoom]),
    ).toBe(1);
    scrollPublicRoomIntoView({ scrollIntoView }, false);
    scrollPublicRoomIntoView({ scrollIntoView }, true);

    expect(scrollIntoView).toHaveBeenNthCalledWith(1, {
      behavior: "smooth",
      block: "start",
    });
    expect(scrollIntoView).toHaveBeenNthCalledWith(2, {
      behavior: "auto",
      block: "start",
    });
  });

  it("공개 방 목록 아래에 더 볼 내용이 있을 때 하단 gradient만 표시한다", () => {
    const html = renderChatRoomListView("ALL", false, "empty", null, undefined, [PUBLIC_ROOM]);
    const indicatorClassName = /class="([^"]+)" data-public-room-scroll-indicator="down"/.exec(
      html,
    )?.[1];
    const roomListClassName = /aria-label="공개 채팅방" class="([^"]+)"/.exec(html)?.[1] ?? "";

    expect(html).toContain('data-public-room-scroll-indicator="down"');
    expect(html).not.toContain('data-public-room-scroll-indicator="up"');
    expect(html).toMatch(/data-public-room-scroll-indicator="down"><\/div>/);
    expect(indicatorClassName).toContain("h-6");
    expect(indicatorClassName).not.toContain("h-8");
    expect(` ${roomListClassName} `).not.toContain(" pr-1 ");
    expect(roomListClassName).not.toContain("scrollbar-gutter");
    expect(
      shouldShowPublicRoomBottomGradient({ clientHeight: 384, scrollHeight: 800, scrollTop: 0 }),
    ).toBe(true);
    expect(
      shouldShowPublicRoomBottomGradient({ clientHeight: 384, scrollHeight: 800, scrollTop: 200 }),
    ).toBe(true);
    expect(
      shouldShowPublicRoomBottomGradient({ clientHeight: 384, scrollHeight: 800, scrollTop: 416 }),
    ).toBe(false);
  });

  it("목록 조회 오류는 상태 카드로, 각 목록 로딩은 실제 개수의 skeleton으로 표시한다", () => {
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
    expect(loadingHtml.match(/data-chat-room-card-skeleton="true"/g)).toHaveLength(5);
    expect(loadingHtml).toContain('aria-label="참여 중인 채팅방을 불러오는 중"');
    expect(loadingHtml).toContain('aria-label="참여 가능한 채팅방을 불러오는 중"');
    expect(loadingHtml).toContain("max-h-[252px]");
    expect(loadingHtml).toContain("max-h-[384px]");
    expect(loadingHtml).toContain("motion-safe:animate-pulse");
    expect(loadingHtml).not.toContain("animate-spin");
    expect(loadingHtml).toContain("bg-[var(--chat-publishing-color-neutral-soft)]");
  });

  it("401 목록 오류는 다시 불러오기 대신 로그인 action을 제공한다", () => {
    const html = renderChatRoomListView("ALL", false, "authentication-error");

    expect(html.match(/>로그인하기<\/a>/g)).toHaveLength(2);
    expect(html.match(/href="\/login\?returnTo=%2Fchat"/g)).toHaveLength(2);
    expect(html).not.toContain(">다시 불러오기</button>");
    expect(html).not.toContain("Bearer");
  });

  it("안읽음 filter 결과가 비면 모든 새 메시지를 확인한 완료 상태를 표시한다", () => {
    const html = renderChatRoomListView("UNREAD");
    const allReadEmptyStateClass =
      /<div class="([^"]+)" data-chat-room-list-state="empty" data-chat-room-list-empty-variant="all-read"/.exec(
        html,
      )?.[1];

    expect(html).toContain("새 메시지를 모두 확인했어요");
    expect(html).toContain("읽지 않은 메시지가 없습니다.");
    expect(html).toContain(
      'class="text-base font-medium leading-6 text-[var(--chat-publishing-color-text)]">새 메시지를 모두 확인했어요',
    );
    expect(html).toContain(">✓</span>");
    expect(html).toContain('data-chat-room-list-empty-variant="all-read"');
    expect(allReadEmptyStateClass).not.toContain("bg-");
    expect(html).not.toContain("참여한 방 중 읽지 않은 메시지가 있는 방이 없습니다.");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("min-h-[252px]");
  });

  it("생성 요청이 열리면 PlatformShell overlay로 sheet를 조립하고 본문을 비활성화한다", () => {
    const html = renderChatRoomListView("ALL", true);

    expect(html).toContain('data-platform-shell-overlay="true"');
    expect(html).toContain('data-create-chat-room-sheet="form"');
    expect(html).toContain('inert=""');
    expect(html).toContain('aria-hidden="true"');
  });

  it("채팅방 상세도 PlatformShell overlay로 조립하고 본문을 비활성화한다", () => {
    const html = renderChatRoomListView("ALL", false, "empty", {
      kind: "available",
      room: PUBLIC_ROOM,
    });

    expect(html).toContain('data-platform-shell-overlay="true"');
    expect(html).toContain('data-chat-room-list-detail-dialog="true"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('inert=""');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("<dialog");
  });
});

describe("chat room list cards", () => {
  it("참여 Room card에 제목, 정원·unread 상태와 분리된 입장·상세 action을 표시한다", () => {
    const html = renderMyRoomCard(createRoomInboxItem());
    const detailButtonClass = /aria-label="프로젝트 회의방 상세 정보 보기" class="([^"]+)"/.exec(
      html,
    )?.[1];

    expect(html).toContain("프로젝트 회의방");
    expect(html).not.toContain("다음 회의는 월요일입니다.");
    expect(html).toContain("읽지 않음 4");
    expect(html).toContain('aria-hidden="true">·</span>');
    expect(html).not.toContain("<time");
    expect(html).toContain("5 / 50명");
    expect(html).toContain('aria-label="읽지 않은 메시지 4개"');
    expect(html).toContain('aria-label="현재 참여 인원 5명, 최대 50명"');
    expect(html).toContain('aria-label="프로젝트 회의방 채팅방 입장"');
    expect(html).toContain('href="/chat/room-01"');
    expect(html).toContain("상세보기");
    expect(html).toContain('id="chat-room-list-detail-trigger-room-01"');
    expect(html.match(/cursor-pointer/g)).toHaveLength(2);
    expect(/<article class="([^"]+)"/.exec(html)?.[1]).not.toContain("hover:bg-");
    expect(detailButtonClass).toContain(
      "hover:text-[var(--chat-publishing-color-primary-emphasis)]",
    );
    expect(detailButtonClass).toContain("font-bold leading-5");
    expect(detailButtonClass).toContain("text-[var(--chat-publishing-color-primary-emphasis)]");
    expect(detailButtonClass).not.toContain("hover:bg-");
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

  it("참여 가능 Room card는 제목, 정원과 상세 action만 표시한다", () => {
    const html = renderToStaticMarkup(
      createElement(PublicRoomCard, {
        highlighted: true,
        isDetailOpen: false,
        onOpenDetails: vi.fn(),
        room: PUBLIC_ROOM,
      }),
    );
    const cardTriggerClass = /aria-label="공개 채팅방 참여하기" class="([^"]+)"/.exec(html)?.[1];
    const visualActionClass = /<span aria-hidden="true" class="([^"]+)">참여하기<\/span>/.exec(
      html,
    )?.[1];

    expect(html).toContain("공개 채팅방");
    expect(html).toContain("3 / 50명");
    expect(html).toContain('aria-label="현재 참여 인원 3명, 최대 50명"');
    expect(html).toContain("참여하기");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('id="chat-room-list-detail-trigger-room-public"');
    expect(html).toContain('data-new-public-room="true"');
    expect(html).toContain("motion-safe:transition-colors");
    expect(html).toContain("bg-[var(--chat-publishing-color-accent-soft)]");
    expect(html.match(/cursor-pointer/g)).toHaveLength(1);
    expect(cardTriggerClass).toContain("absolute -inset-px");
    expect(cardTriggerClass).toContain("hover:border-[var(--chat-publishing-color-primary)]");
    expect(cardTriggerClass).toContain("hover:bg-[var(--chat-publishing-color-accent-soft)]");
    expect(visualActionClass).toContain("font-bold leading-5");
    expect(visualActionClass).toContain("text-[var(--chat-publishing-color-primary-emphasis)]");
    expect(html).not.toContain("자세히 보기");
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
    expect(html).toContain('aria-label="카테고리: 정책"');
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
    const enterLinkClass = /class="([^"]+)" href="\/chat\/room-01">입장하기<\/a>/.exec(html)?.[1];

    expect(html).toContain('href="/chat/room-01"');
    expect(html).toContain("입장하기");
    expect(enterLinkClass).toContain("w-full");
    expect(enterLinkClass).not.toContain("w-fit");
    expect(html).toContain('aria-label="카테고리: 지역 현안"');
    expect(html).not.toContain("참여하기");
  });
});

const PUBLIC_ROOM: PublicRoomListItem = {
  roomId: "room-public",
  name: "공개 채팅방",
  description: "공개 채팅방 설명",
  categoryIds: ["00000000-0000-4000-8000-000000000001"],
  categorySummaries: [{ categoryId: "00000000-0000-4000-8000-000000000001", name: "정책" }],
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
  listStatus: "authentication-error" | "empty" | "error" | "loading" = "empty",
  roomDetailSelection: ChatRoomListDetailSelection | null = null,
  appliedPublicRoomQuery?: string,
  publicRoomItems: readonly PublicRoomListItem[] = [],
  hasReachedActiveRoomLimit = false,
): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const isError = listStatus === "error" || listStatus === "authentication-error";
  const emptyListState = {
    error:
      listStatus === "authentication-error"
        ? new ChatApiError(401, "Unauthorized", "http://localhost:8082", {
            detail: "A valid Bearer token is required.",
          })
        : listStatus === "error"
          ? new Error("목록 조회 실패")
          : null,
    hasNextPage: false,
    isError,
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
        hasReachedActiveRoomLimit,
        isCreateRoomOpen,
        participatingRoomFilter: { select: vi.fn(), value: filter },
        participatingRooms: emptyListState,
        publicRoomSearch: createPublicRoomSearchController(appliedPublicRoomQuery),
        publicRooms: { ...emptyListState, rooms: publicRoomItems },
        roomDetail: { close: vi.fn(), open: vi.fn(), selection: roomDetailSelection },
        toggleCreateRoomForm: vi.fn(),
      }),
    ),
  );
}

function createPublicRoomSearchController(appliedQuery?: string): PublicRoomSearchController {
  return {
    appliedQuery,
    applySearch: vi.fn(),
    draftQuery: "",
    endComposition: vi.fn(),
    isComposing: false,
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
    categoryIds: ["00000000-0000-4000-8000-000000000003"],
    categorySummaries: [{ categoryId: "00000000-0000-4000-8000-000000000003", name: "지역 현안" }],
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
