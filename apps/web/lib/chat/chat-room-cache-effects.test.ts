import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  invalidateRoomLists,
  invalidateRoomSettingsState,
  invalidateRoomState,
  refreshAuthoritativeRoomQueries,
} from "./chat-room-cache-effects";
import { chatRoomQueryKeys } from "./chat-room-queries";

describe("chat room cache effects", () => {
  it("방 목록 cache만 기존 순서로 무효화한다", async () => {
    const { invalidateQueries, queryClient } = createObservedQueryClient();

    await invalidateRoomLists(queryClient);

    expectInvalidationOrder(invalidateQueries, [
      chatRoomQueryKeys.publicLists(),
      chatRoomQueryKeys.myLists(),
      chatRoomQueryKeys.roomInboxes(),
    ]);
  });

  it("설정 변경 cache를 목록과 상세 순서로 무효화한다", async () => {
    const { invalidateQueries, queryClient } = createObservedQueryClient();

    await invalidateRoomSettingsState(queryClient, "room-01");

    expectInvalidationOrder(invalidateQueries, [
      chatRoomQueryKeys.publicLists(),
      chatRoomQueryKeys.myLists(),
      chatRoomQueryKeys.roomInboxes(),
      chatRoomQueryKeys.detail("room-01"),
    ]);
  });

  it("Room command cache를 기존 목록 우선순위로 무효화한다", async () => {
    const { invalidateQueries, queryClient } = createObservedQueryClient();

    await invalidateRoomState(queryClient, "room-01");

    expectInvalidationOrder(invalidateQueries, [
      chatRoomQueryKeys.publicLists(),
      chatRoomQueryKeys.myLists(),
      chatRoomQueryKeys.roomInboxes(),
      chatRoomQueryKeys.detail("room-01"),
      chatRoomQueryKeys.myMembership("room-01"),
      chatRoomQueryKeys.membershipLists("room-01"),
    ]);
  });

  it("Room event cache를 기존 authoritative query 우선순위로 무효화한다", async () => {
    const { invalidateQueries, queryClient } = createObservedQueryClient();

    await refreshAuthoritativeRoomQueries(queryClient, "room-01");

    expectInvalidationOrder(invalidateQueries, [
      chatRoomQueryKeys.detail("room-01"),
      chatRoomQueryKeys.myMembership("room-01"),
      chatRoomQueryKeys.membershipLists("room-01"),
      chatRoomQueryKeys.publicLists(),
      chatRoomQueryKeys.myLists(),
      chatRoomQueryKeys.roomInboxes(),
    ]);
  });
});

function createObservedQueryClient() {
  const queryClient = new QueryClient();
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
  return { invalidateQueries, queryClient };
}

function expectInvalidationOrder(
  invalidateQueries: ReturnType<typeof createObservedQueryClient>["invalidateQueries"],
  queryKeys: readonly (readonly unknown[])[],
): void {
  expect(invalidateQueries.mock.calls.map(([filters]) => filters?.queryKey)).toEqual(queryKeys);
}
