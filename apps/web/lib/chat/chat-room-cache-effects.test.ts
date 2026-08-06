import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  invalidateRoomLists,
  invalidateRoomSettingsState,
  invalidateRoomState,
  refreshAuthoritativeRoomQueries,
  resetRoomInboxQueries,
} from "./chat-room-cache-effects";
import { chatRoomQueryKeys } from "./chat-room-queries";

describe("chat room cache effects", () => {
  it("방 목록 cache만 기존 순서로 무효화한다", async () => {
    const { invalidateQueries, queryClient, resetQueries } = createObservedQueryClient();

    await invalidateRoomLists(queryClient);

    expectInvalidationOrder(invalidateQueries, [
      chatRoomQueryKeys.publicLists(),
      chatRoomQueryKeys.myLists(),
    ]);
    expectRoomInboxReset(resetQueries);
  });

  it("설정 변경 cache를 목록과 상세 순서로 무효화한다", async () => {
    const { invalidateQueries, queryClient, resetQueries } = createObservedQueryClient();

    await invalidateRoomSettingsState(queryClient, "room-01");

    expectInvalidationOrder(invalidateQueries, [
      chatRoomQueryKeys.publicLists(),
      chatRoomQueryKeys.myLists(),
      chatRoomQueryKeys.detail("room-01"),
    ]);
    expectRoomInboxReset(resetQueries);
  });

  it("Room command cache를 기존 목록 우선순위로 무효화한다", async () => {
    const { invalidateQueries, queryClient, resetQueries } = createObservedQueryClient();

    await invalidateRoomState(queryClient, "room-01");

    expectInvalidationOrder(invalidateQueries, [
      chatRoomQueryKeys.publicLists(),
      chatRoomQueryKeys.myLists(),
      chatRoomQueryKeys.detail("room-01"),
      chatRoomQueryKeys.myMembership("room-01"),
      chatRoomQueryKeys.membershipLists("room-01"),
    ]);
    expectRoomInboxReset(resetQueries);
  });

  it("Room event cache를 기존 authoritative query 우선순위로 무효화한다", async () => {
    const { invalidateQueries, queryClient, resetQueries } = createObservedQueryClient();

    await refreshAuthoritativeRoomQueries(queryClient, "room-01");

    expectInvalidationOrder(invalidateQueries, [
      chatRoomQueryKeys.detail("room-01"),
      chatRoomQueryKeys.myMembership("room-01"),
      chatRoomQueryKeys.membershipLists("room-01"),
      chatRoomQueryKeys.publicLists(),
      chatRoomQueryKeys.myLists(),
    ]);
    expectRoomInboxReset(resetQueries);
  });

  it("Room inbox 전용 helper가 page chain reset 옵션을 사용한다", async () => {
    const { queryClient, resetQueries } = createObservedQueryClient();

    await resetRoomInboxQueries(queryClient);

    expectRoomInboxReset(resetQueries);
  });

  it("active Room inbox의 기존 pages와 pageParams를 버리고 첫 페이지부터 재조회한다", async () => {
    const queryClient = createTestQueryClient();
    let generation: "old" | "new" = "old";
    const queryFn = vi.fn(({ pageParam }: { pageParam: string | null }) =>
      Promise.resolve(getRoomInboxTestPage(generation, pageParam)),
    );
    const observer = new InfiniteQueryObserver(queryClient, createRoomInboxTestOptions(queryFn));
    const unsubscribe = observer.subscribe(() => {});

    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
    await observer.fetchNextPage();
    expect(observer.getCurrentResult().data).toMatchObject({
      pages: [{ items: ["room-A", "room-B"] }, { items: ["room-C", "room-D"] }],
      pageParams: [null, "cursor-1"],
    });

    generation = "new";
    await resetRoomInboxQueries(queryClient);

    expect(observer.getCurrentResult().data).toEqual({
      pages: [{ items: ["room-D", "room-A"], nextCursor: "cursor-new" }],
      pageParams: [null],
    });
    await observer.fetchNextPage();
    expect(queryFn).toHaveBeenLastCalledWith(expect.objectContaining({ pageParam: "cursor-new" }));
    expect(observer.getCurrentResult().data).toMatchObject({
      pages: [{ items: ["room-D", "room-A"] }, { items: ["room-B", "room-C"] }],
      pageParams: [null, "cursor-new"],
    });

    unsubscribe();
  });

  it("inactive Room inbox는 reset 후 다음 mount에서 첫 페이지부터 조회한다", async () => {
    const queryClient = createTestQueryClient();
    const queryKey = chatRoomQueryKeys.roomInbox(20);
    queryClient.setQueryData(queryKey, {
      pages: [getRoomInboxTestPage("old", null), getRoomInboxTestPage("old", "cursor-1")],
      pageParams: [null, "cursor-1"],
    });

    await resetRoomInboxQueries(queryClient);
    expect(queryClient.getQueryData(queryKey)).toBeUndefined();

    const queryFn = vi.fn(({ pageParam }: { pageParam: string | null }) =>
      Promise.resolve(getRoomInboxTestPage("new", pageParam)),
    );
    const observer = new InfiniteQueryObserver(queryClient, createRoomInboxTestOptions(queryFn));
    const unsubscribe = observer.subscribe(() => {});

    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
    expect(queryFn).toHaveBeenCalledWith(expect.objectContaining({ pageParam: null }));
    expect(observer.getCurrentResult().data?.pageParams).toEqual([null]);

    unsubscribe();
  });

  it("reset 전에 진행 중이던 이전 cursor 결과를 새 page chain에 합치지 않는다", async () => {
    const queryClient = createTestQueryClient();
    let generation: "old" | "new" = "old";
    const oldCursorDeferred: {
      resolve?: (page: RoomInboxTestPage) => void;
    } = {};
    const queryFn = vi.fn(({ pageParam }: { pageParam: string | null }) => {
      if (generation === "old" && pageParam === "cursor-1") {
        return new Promise<RoomInboxTestPage>((resolve) => {
          oldCursorDeferred.resolve = resolve;
        });
      }

      return Promise.resolve(getRoomInboxTestPage(generation, pageParam));
    });
    const observer = new InfiniteQueryObserver(queryClient, createRoomInboxTestOptions(queryFn));
    const unsubscribe = observer.subscribe(() => {});

    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
    const oldCursorRequest = observer.fetchNextPage().catch(() => undefined);
    await vi.waitFor(() => expect(oldCursorDeferred.resolve).toBeTypeOf("function"));

    generation = "new";
    await resetRoomInboxQueries(queryClient);
    oldCursorDeferred.resolve?.(getRoomInboxTestPage("old", "cursor-1"));
    await oldCursorRequest;

    expect(observer.getCurrentResult().data).toEqual({
      pages: [{ items: ["room-D", "room-A"], nextCursor: "cursor-new" }],
      pageParams: [null],
    });

    unsubscribe();
  });
});

function createObservedQueryClient() {
  const queryClient = new QueryClient();
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
  const resetQueries = vi.spyOn(queryClient, "resetQueries");
  return { invalidateQueries, queryClient, resetQueries };
}

function expectRoomInboxReset(
  resetQueries: ReturnType<typeof createObservedQueryClient>["resetQueries"],
): void {
  expect(resetQueries).toHaveBeenCalledTimes(1);
  expect(resetQueries).toHaveBeenCalledWith(
    { queryKey: chatRoomQueryKeys.roomInboxes() },
    { cancelRefetch: true },
  );
}

function expectInvalidationOrder(
  invalidateQueries: ReturnType<typeof createObservedQueryClient>["invalidateQueries"],
  queryKeys: readonly (readonly unknown[])[],
): void {
  expect(invalidateQueries.mock.calls.map(([filters]) => filters?.queryKey)).toEqual(queryKeys);
}

type RoomInboxTestPage = Readonly<{
  items: readonly string[];
  nextCursor: string | null;
}>;

function createRoomInboxTestOptions(
  queryFn: (context: { pageParam: string | null }) => Promise<RoomInboxTestPage>,
) {
  return {
    queryKey: chatRoomQueryKeys.roomInbox(20),
    initialPageParam: null as string | null,
    queryFn,
    getNextPageParam: (lastPage: RoomInboxTestPage) => lastPage.nextCursor,
  };
}

function getRoomInboxTestPage(
  generation: "old" | "new",
  pageParam: string | null,
): RoomInboxTestPage {
  if (generation === "new") {
    return pageParam === null
      ? { items: ["room-D", "room-A"], nextCursor: "cursor-new" }
      : { items: ["room-B", "room-C"], nextCursor: null };
  }

  return pageParam === null
    ? { items: ["room-A", "room-B"], nextCursor: "cursor-1" }
    : { items: ["room-C", "room-D"], nextCursor: null };
}

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}
