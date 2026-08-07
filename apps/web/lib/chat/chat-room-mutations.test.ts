import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ChatApiError } from "./chat-fetch";
import {
  createRoomMutationOptions,
  joinRoomMutationOptions,
  transferRoomOwnershipMutationOptions,
  updateRoomReadStateMutationOptions,
  updateRoomSettingsMutationOptions,
} from "./chat-room-mutations";
import { chatRoomQueryKeys } from "./chat-room-queries";

const IDEMPOTENCY_KEY = "07af9111-3e20-43e5-ae80-78d1bf547647";
const PUBLIC_LIST_KEY = chatRoomQueryKeys.publicList({
  joinPolicy: "OPEN",
  limit: 20,
});

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
        categories: ["POLICY" as const],
        visibility: "LISTED" as const,
        joinPolicy: "OPEN" as const,
      },
    };

    await observer.mutate(command);

    expect(createRoom).toHaveBeenCalledWith(command);
    expect(isInvalidated(queryClient, PUBLIC_LIST_KEY)).toBe(true);
    expect(isInvalidated(queryClient, chatRoomQueryKeys.myList(20))).toBe(true);
    expect(isInvalidated(queryClient, chatRoomQueryKeys.detail("room-01"))).toBe(false);
  });

  it.each([
    {
      label: "설정이 변경된 경우",
      response: {
        ...UPDATE_ROOM_SETTINGS_RESPONSE,
        code: "ROOM_SETTINGS_UPDATED" as const,
        replayed: false,
      },
    },
    {
      label: "설정이 이미 같은 경우",
      response: {
        ...UPDATE_ROOM_SETTINGS_RESPONSE,
        code: "ROOM_SETTINGS_UNCHANGED" as const,
        replayed: false,
      },
    },
    {
      label: "과거 command receipt가 replay된 경우",
      response: {
        ...UPDATE_ROOM_SETTINGS_RESPONSE,
        code: "ROOM_SETTINGS_UPDATED" as const,
        replayed: true,
        roomVersion: 7,
      },
    },
  ])(
    "$label Room 상세와 목록만 무효화하고 응답 snapshot을 직접 적용하지 않는다",
    async ({ response }) => {
      const queryClient = createQueryClient();
      seedRoomQueries(queryClient);
      seedMessageHistories(queryClient);
      const updateRoomSettings = vi.fn(async () => response);
      const options = updateRoomSettingsMutationOptions(queryClient, {
        updateRoomSettings,
      });
      const observer = new MutationObserver(queryClient, options);
      const variables = {
        roomId: "room-01",
        command: {
          idempotencyKey: IDEMPOTENCY_KEY,
          body: {
            description: "새로운 설명",
            visibility: "UNLISTED" as const,
          },
        },
      };

      await observer.mutate(variables);

      expect(options.retry).toBe(false);
      expect(updateRoomSettings).toHaveBeenCalledWith("room-01", variables.command);
      expect(queryClient.getQueryData(chatRoomQueryKeys.detail("room-01"))).toBe("detail");
      expect(isInvalidated(queryClient, chatRoomQueryKeys.detail("room-01"))).toBe(true);
      expect(isInvalidated(queryClient, PUBLIC_LIST_KEY)).toBe(true);
      expect(isInvalidated(queryClient, chatRoomQueryKeys.myList(20))).toBe(true);
      expect(isInvalidated(queryClient, chatRoomQueryKeys.myMembership("room-01"))).toBe(false);
      expect(
        isInvalidated(queryClient, chatRoomQueryKeys.membershipList("room-01", "ACTIVE", 20)),
      ).toBe(false);
      expect(queryClient.getQueryData(chatRoomQueryKeys.messageHistory("room-01", 50))).toBe(
        "room-01-50",
      );
    },
  );

  it("방 상태 Command 성공 시 해당 방과 모든 목록 캐시를 무효화한다", async () => {
    const queryClient = createQueryClient();
    seedRoomQueries(queryClient);
    seedMessageHistories(queryClient);
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
    expect(isInvalidated(queryClient, PUBLIC_LIST_KEY)).toBe(true);
    expect(isInvalidated(queryClient, chatRoomQueryKeys.myList(20))).toBe(true);
    expect(isInvalidated(queryClient, chatRoomQueryKeys.detail("room-01"))).toBe(true);
    expect(isInvalidated(queryClient, chatRoomQueryKeys.myMembership("room-01"))).toBe(true);
    expect(
      isInvalidated(queryClient, chatRoomQueryKeys.membershipList("room-01", "ACTIVE", 20)),
    ).toBe(true);
    expect(queryClient.getQueryData(chatRoomQueryKeys.messageHistory("room-01", 50))).toBe(
      "room-01-50",
    );
  });

  it("재참여 성공 시 해당 방의 모든 메시지 이력 cache를 라우팅 전에 제거한다", async () => {
    const queryClient = createQueryClient();
    seedRoomQueries(queryClient);
    seedMessageHistories(queryClient);
    const joinRoom = vi.fn(async () => ({
      ...JOIN_ROOM_RESPONSE,
      code: "REJOINED" as const,
      replayed: true,
    }));
    const observer = new MutationObserver(
      queryClient,
      joinRoomMutationOptions(queryClient, { joinRoom }),
    );

    await observer.mutate(createJoinVariables());

    expect(
      queryClient.getQueryData(chatRoomQueryKeys.messageHistory("room-01", 20)),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(chatRoomQueryKeys.messageHistory("room-01", 50)),
    ).toBeUndefined();
    expect(queryClient.getQueryData(chatRoomQueryKeys.messageHistory("room-02", 50))).toBe(
      "room-02-50",
    );
  });

  it("이미 활성 상태인 중복 참여는 메시지 접근 경계를 바꾸지 않으므로 cache를 유지한다", async () => {
    const queryClient = createQueryClient();
    seedMessageHistories(queryClient);
    const joinRoom = vi.fn(async () => ({
      ...JOIN_ROOM_RESPONSE,
      code: "ALREADY_ACTIVE" as const,
    }));
    const observer = new MutationObserver(
      queryClient,
      joinRoomMutationOptions(queryClient, { joinRoom }),
    );

    await observer.mutate(createJoinVariables());

    expect(queryClient.getQueryData(chatRoomQueryKeys.messageHistory("room-01", 20))).toBe(
      "room-01-20",
    );
    expect(queryClient.getQueryData(chatRoomQueryKeys.messageHistory("room-01", 50))).toBe(
      "room-01-50",
    );
  });

  it("재참여 요청이 실패하면 기존 메시지 cache를 유지한다", async () => {
    const queryClient = createQueryClient();
    seedMessageHistories(queryClient);
    const error = new Error("재참여 실패");
    const joinRoom = vi.fn(async () => Promise.reject(error));
    const observer = new MutationObserver(
      queryClient,
      joinRoomMutationOptions(queryClient, { joinRoom }),
    );

    await expect(observer.mutate(createJoinVariables())).rejects.toBe(error);

    expect(queryClient.getQueryData(chatRoomQueryKeys.messageHistory("room-01", 50))).toBe(
      "room-01-50",
    );
  });

  it.each([false, true])(
    "사용자 ACTIVE Room quota 거절은 JOIN/REJOIN 성공 cache effect를 실행하지 않는다 (replayed=%s)",
    async (replayed) => {
      const queryClient = createQueryClient();
      seedRoomQueries(queryClient);
      seedMessageHistories(queryClient);
      const error = createUserActiveRoomLimitError(replayed);
      const joinRoom = vi.fn(async () => Promise.reject(error));
      const options = joinRoomMutationOptions(queryClient, { joinRoom });
      const observer = new MutationObserver(queryClient, options);

      await expect(observer.mutate(createJoinVariables())).rejects.toBe(error);

      expect(options.retry).toBe(false);
      expect(isInvalidated(queryClient, PUBLIC_LIST_KEY)).toBe(false);
      expect(isInvalidated(queryClient, chatRoomQueryKeys.myList(20))).toBe(false);
      expect(isInvalidated(queryClient, chatRoomQueryKeys.detail("room-01"))).toBe(false);
      expect(isInvalidated(queryClient, chatRoomQueryKeys.myMembership("room-01"))).toBe(false);
      expect(
        isInvalidated(queryClient, chatRoomQueryKeys.membershipList("room-01", "ACTIVE", 20)),
      ).toBe(false);
      expect(queryClient.getQueryData(chatRoomQueryKeys.messageHistory("room-01", 50))).toBe(
        "room-01-50",
      );
    },
  );

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
          targetMembershipId: "membership-02",
        },
      },
    };

    await observer.mutate(variables);

    expect(options.retry).toBe(false);
    expect(transferRoomOwnership).toHaveBeenCalledWith("room-01", variables.command);
  });

  it("read-state 요청은 cache effect 없이 공통 bounded retry 정책만 사용한다", async () => {
    const queryClient = createQueryClient();
    const updateRoomReadState = vi.fn(async () => ({
      roomId: "room-01",
      readThroughSequence: 123,
      updated: true,
    }));
    const options = updateRoomReadStateMutationOptions({ updateRoomReadState });
    const observer = new MutationObserver(queryClient, options);
    const variables = {
      request: { throughSequence: 123 },
      roomId: "room-01",
    };

    await observer.mutate(variables);

    expect(updateRoomReadState).toHaveBeenCalledWith("room-01", variables.request);
    expect(options.onSuccess).toBeUndefined();
    expect(options.retry).toBeTypeOf("function");
    expect(options.retryDelay).toBeTypeOf("function");
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
  queryClient.setQueryData(PUBLIC_LIST_KEY, "public");
  queryClient.setQueryData(chatRoomQueryKeys.myList(20), "my");
  queryClient.setQueryData(chatRoomQueryKeys.detail("room-01"), "detail");
  queryClient.setQueryData(chatRoomQueryKeys.myMembership("room-01"), "membership");
  queryClient.setQueryData(chatRoomQueryKeys.membershipList("room-01", "ACTIVE", 20), "members");
}

function seedMessageHistories(queryClient: QueryClient): void {
  queryClient.setQueryData(chatRoomQueryKeys.messageHistory("room-01", 20), "room-01-20");
  queryClient.setQueryData(chatRoomQueryKeys.messageHistory("room-01", 50), "room-01-50");
  queryClient.setQueryData(chatRoomQueryKeys.messageHistory("room-02", 50), "room-02-50");
}

function createJoinVariables() {
  return {
    roomId: "room-01",
    command: {
      idempotencyKey: IDEMPOTENCY_KEY,
      body: undefined,
    },
  };
}

function isInvalidated(queryClient: QueryClient, queryKey: readonly unknown[]): boolean {
  return queryClient.getQueryState(queryKey)?.isInvalidated ?? false;
}

function createUserActiveRoomLimitError(replayed: boolean): ChatApiError {
  return new ChatApiError(
    409,
    "Conflict",
    "http://localhost:8082/api/v1/rooms/room-01/commands/join",
    {
      type: "urn:hamcheeze:problem:user-active-room-limit-exceeded",
      title: "Room command rejected",
      status: 409,
      detail: "The user has reached the active room limit.",
      instance: "/api/v1/rooms/room-01/commands/join",
      code: "USER_ACTIVE_ROOM_LIMIT_EXCEEDED",
      clientRequestId: IDEMPOTENCY_KEY,
      replayed,
      retryable: false,
    },
  );
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

const UPDATE_ROOM_SETTINGS_RESPONSE = {
  clientRequestId: IDEMPOTENCY_KEY,
  replayed: false,
  roomId: "room-01",
  name: "새로운 방 이름",
  description: "새로운 설명",
  categories: ["POLICY" as const],
  visibility: "UNLISTED" as const,
  joinPolicy: "OPEN" as const,
  roomVersion: 8,
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
