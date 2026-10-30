// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicRoomSearchController } from "@/components/chat/use-public-room-search";
import type { PublicRoomListItem } from "@/lib/chat/chat-room-contracts";
import { ChatRoomListView } from "./chat-room-list-view";

vi.mock("next/navigation", () => ({
  usePathname: () => "/chat",
  useRouter: () => ({ push: vi.fn() }),
}));

describe("참여 가능한 방 다음 페이지", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("다음 페이지가 있으면 더 보기 버튼 없이 목록 상자 끝에 가까워질 때 자동으로 이어 받는다", () => {
    const intersectionObserver = stubIntersectionObserver();
    const publicRooms = createPublicRoomListState({ hasNextPage: true });

    renderPublicRoomList(publicRooms);

    expect(screen.queryByRole("button", { name: "공개 방 더 보기" })).toBeNull();
    expect(intersectionObserver.options?.root).toBe(
      screen.getByRole("list", { name: "공개 토론방" }),
    );
    expect(publicRooms.loadMore).not.toHaveBeenCalled();

    act(() => intersectionObserver.report(true));

    expect(publicRooms.loadMore).toHaveBeenCalledTimes(1);
  });

  it("다음 페이지를 받는 중이면 목록 상자 끝에 불러오는 중 안내를 보여 주고 다시 요청하지 않는다", () => {
    const intersectionObserver = stubIntersectionObserver();
    const publicRooms = createPublicRoomListState({
      hasNextPage: true,
      isFetching: true,
      isFetchingNextPage: true,
    });

    renderPublicRoomList(publicRooms);
    act(() => intersectionObserver.report(true));

    expect(screen.getByRole("status").textContent).toBe("공개 방을 더 불러오는 중이에요");
    expect(publicRooms.loadMore).not.toHaveBeenCalled();
  });

  it("다음 페이지를 받지 못하면 자동 요청을 멈추고 공개 방 더 보기 버튼으로 이어 받는다", () => {
    const intersectionObserver = stubIntersectionObserver();
    const publicRooms = createPublicRoomListState({
      error: new Error("network"),
      hasNextPage: true,
      isError: true,
      isFetchNextPageError: true,
    });

    renderPublicRoomList(publicRooms);
    act(() => intersectionObserver.report(true));

    expect(publicRooms.loadMore).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "공개 방 더 보기" }));

    expect(publicRooms.loadMore).toHaveBeenCalledTimes(1);
  });

  it("모든 페이지를 받았어도 방이 목록 상자를 넘칠 때만 목록 끝에 마무리 문구를 보여 준다", () => {
    stubIntersectionObserver();
    renderPublicRoomList(createPublicRoomListState());
    const list = screen.getByRole("list", { name: "공개 토론방" });

    expect(screen.queryByText("모든 토론방을 확인했어요.")).toBeNull();

    // jsdom은 layout을 계산하지 않으므로, 412px 상자 안에서 마지막 방 card가 500px 아래에서 끝나는 상황을 대신 정함
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 412 });
    vi.spyOn(list, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ height: 412 }));
    const lastRoom = list.querySelector<HTMLElement>('[data-room-list-room="true"]')!;
    vi.spyOn(lastRoom, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ height: 120, y: 380 }),
    );
    fireEvent.scroll(list);

    expect(screen.getByText("모든 토론방을 확인했어요.")).toBeTruthy();
  });
});

describe("참여 가능한 방 변경 반영", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("공개방이 바뀌었을 때 목록 위쪽을 보고 있으면 첫 페이지부터 다시 받는다", () => {
    stubIntersectionObserver();
    const publicRooms = createPublicRoomListState({ needsRefresh: true });

    renderPublicRoomList(publicRooms);

    expect(publicRooms.refreshFromFirstPage).toHaveBeenCalledTimes(1);
  });

  it("목록 상자를 깊이 내려 보고 있으면 다시 받지 않다가 위쪽으로 돌아오면 첫 페이지부터 다시 받는다", () => {
    stubIntersectionObserver();
    const publicRooms = createPublicRoomListState();
    const { rerender } = renderPublicRoomList(publicRooms);
    const list = screen.getByRole("list", { name: "공개 토론방" });
    // jsdom은 layout을 계산하지 않으므로, 412px 상자를 상자 두 화면 넘게 내린 상황을 대신 정함
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 412 });
    Object.defineProperty(list, "scrollTop", { configurable: true, value: 900, writable: true });
    fireEvent.scroll(list);

    const changedPublicRooms = { ...publicRooms, needsRefresh: true };
    rerender(createPublicRoomListElement(changedPublicRooms));

    expect(publicRooms.refreshFromFirstPage).not.toHaveBeenCalled();

    list.scrollTop = 300;
    fireEvent.scroll(list);

    expect(publicRooms.refreshFromFirstPage).toHaveBeenCalledTimes(1);
  });
});

function createPublicRoomListState(
  patch: Partial<{
    error: unknown;
    hasNextPage: boolean;
    isError: boolean;
    isFetchNextPageError: boolean;
    isFetching: boolean;
    isFetchingNextPage: boolean;
    needsRefresh: boolean;
  }> = {},
) {
  return {
    error: null,
    hasNextPage: false,
    isError: false,
    isFetchNextPageError: false,
    isFetching: false,
    isFetchingNextPage: false,
    isPending: false,
    loadMore: vi.fn(),
    needsRefresh: false,
    refreshFromFirstPage: vi.fn(),
    retry: vi.fn(),
    rooms: [PUBLIC_ROOM],
    ...patch,
  };
}

const testQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

function renderPublicRoomList(publicRooms: ReturnType<typeof createPublicRoomListState>) {
  return render(createPublicRoomListElement(publicRooms));
}

function createPublicRoomListElement(publicRooms: ReturnType<typeof createPublicRoomListState>) {
  return createElement(
    QueryClientProvider,
    { client: testQueryClient },
    createElement(ChatRoomListView, {
      closeCreateRoomForm: vi.fn(),
      createRoomTriggerRef: { current: null },
      hasReachedActiveRoomLimit: false,
      isCreateRoomOpen: false,
      participatingRoomFilter: { select: vi.fn(), value: "ALL" },
      participatingRooms: { ...createPublicRoomListState(), rooms: [] },
      publicRoomSearch: createPublicRoomSearchController(),
      publicRooms,
      roomDetail: { close: vi.fn(), open: vi.fn(), selection: null },
      toggleCreateRoomForm: vi.fn(),
    }),
  );
}

function stubIntersectionObserver(): {
  options: IntersectionObserverInit | undefined;
  report: (isIntersecting: boolean) => void;
} {
  const state: {
    callback: IntersectionObserverCallback | null;
    options: IntersectionObserverInit | undefined;
  } = { callback: null, options: undefined };

  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        state.callback = callback;
        state.options = options;
      }

      disconnect() {}

      observe() {}
    },
  );

  return {
    get options() {
      return state.options;
    },
    report: (isIntersecting) => {
      state.callback?.(
        [{ isIntersecting } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    },
  };
}

function createPublicRoomSearchController(): PublicRoomSearchController {
  return {
    appliedQuery: undefined,
    applySearch: vi.fn(),
    draftQuery: "",
    setDraftQuery: vi.fn(),
    validationMessage: undefined,
  };
}

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
