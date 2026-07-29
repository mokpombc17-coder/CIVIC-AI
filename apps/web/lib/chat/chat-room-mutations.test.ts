import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  createRoomMutationOptions,
  joinRoomMutationOptions,
  transferRoomOwnershipMutationOptions,
} from "./chat-room-mutations";
import { chatRoomQueryKeys } from "./chat-room-queries";

const IDEMPOTENCY_KEY = "07af9111-3e20-43e5-ae80-78d1bf547647";

describe("chat room mutation options", () => {
  it("방 생성 성공 시 공개 방과 내 방 목록만 무효화한다", async () => {
    const queryClient = createQueryClient();
    seedRoomQueries(queryClient);
    const createRoom = vi.fn(async () => CREATE_ROOM_RESPONSE);
    const observer = new MutationObserver(
      queryClient,
      createRoomMutationOptions(queryClient, { createRoom }),
    );
    const command = {
      idempotencyKey: IDEMPOTENCY_KEY,
      body: {
        name: "시민 AI 토론방",
        visibility: "LISTED" as const,
        joinPolicy: "OPEN" as const,
      },
    };

    await observer.mutate(command);

    expect(createRoom).toHaveBeenCalledWith(command);
    expect(isInvalidated(queryClient, chatRoomQueryKeys.publicList(20))).toBe(true);
    expect(isInvalidated(queryClient, chatRoomQueryKeys.myList(20))).toBe(true);
    expect(isInvalidated(queryClient, chatRoomQueryKeys.detail("room-01"))).toBe(false);
  });

  it("방 상태 Command 성공 시 해당 방과 모든 목록 캐시를 무효화한다", async () => {
    const queryClient = createQueryClient();
    seedRoomQueries(queryClient);
    const joinRoom = vi.fn(async () => JOIN_ROOM_RESPONSE);
    const observer = new MutationObserver(
      queryClient,
      joinRoomMutationOptions(queryClient, { joinRoom }),
    );
    const variables = {
      roomId: "room-01",
      command: {
        idempotencyKey: IDEMPOTENCY_KEY,
        body: undefined,
      },
    };

    await observer.mutate(variables);

    expect(joinRoom).toHaveBeenCalledWith("room-01", variables.command);
    expect(isInvalidated(queryClient, chatRoomQueryKeys.publicList(20))).toBe(true);
    expect(isInvalidated(queryClient, chatRoomQueryKeys.myList(20))).toBe(true);
    expect(isInvalidated(queryClient, chatRoomQueryKeys.detail("room-01"))).toBe(true);
    expect(isInvalidated(queryClient, chatRoomQueryKeys.myMembership("room-01"))).toBe(true);
    expect(
      isInvalidated(queryClient, chatRoomQueryKeys.membershipList("room-01", "ACTIVE", 20)),
    ).toBe(true);
  });

  it("mutation 자동 재시도를 끄고 기존 IdempotentCommand를 그대로 전달한다", async () => {
    const queryClient = createQueryClient();
    const transferRoomOwnership = vi.fn(async () => TRANSFER_OWNERSHIP_RESPONSE);
    const options = transferRoomOwnershipMutationOptions(queryClient, {
      transferRoomOwnership,
    });
    const observer = new MutationObserver(queryClient, options);
    const variables = {
      roomId: "room-01",
      command: {
        idempotencyKey: IDEMPOTENCY_KEY,
        body: {
          targetUserId: "local-user-2",
        },
      },
    };

    await observer.mutate(variables);

    expect(options.retry).toBe(false);
    expect(transferRoomOwnership).toHaveBeenCalledWith("room-01", variables.command);
  });
});

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
    },
  });
}

function seedRoomQueries(queryClient: QueryClient): void {
  queryClient.setQueryData(chatRoomQueryKeys.publicList(20), "public");
  queryClient.setQueryData(chatRoomQueryKeys.myList(20), "my");
  queryClient.setQueryData(chatRoomQueryKeys.detail("room-01"), "detail");
  queryClient.setQueryData(chatRoomQueryKeys.myMembership("room-01"), "membership");
  queryClient.setQueryData(chatRoomQueryKeys.membershipList("room-01", "ACTIVE", 20), "members");
}

function isInvalidated(queryClient: QueryClient, queryKey: readonly unknown[]): boolean {
  return queryClient.getQueryState(queryKey)?.isInvalidated ?? false;
}

const CREATE_ROOM_RESPONSE = {
  clientRequestId: IDEMPOTENCY_KEY,
  code: "ROOM_CREATED" as const,
  replayed: false,
  roomId: "room-01",
  ownerMembershipId: "membership-01",
  ownerUserId: "local-user-1",
  roomVersion: 1,
  ownerMembershipVersion: 1,
};

const JOIN_ROOM_RESPONSE = {
  clientRequestId: IDEMPOTENCY_KEY,
  code: "JOINED" as const,
  replayed: false,
  roomId: "room-01",
  membershipId: "membership-01",
  membershipUserId: "local-user-1",
  roomVersion: 2,
  membershipVersion: 1,
};

const TRANSFER_OWNERSHIP_RESPONSE = {
  clientRequestId: IDEMPOTENCY_KEY,
  code: "OWNERSHIP_TRANSFERRED" as const,
  replayed: false,
  roomId: "room-01",
  previousOwnerUserId: "local-user-1",
  newOwnerUserId: "local-user-2",
  previousOwnerMembershipId: "membership-01",
  newOwnerMembershipId: "membership-02",
  roomVersion: 3,
  previousOwnerMembershipVersion: 2,
  newOwnerMembershipVersion: 2,
};
