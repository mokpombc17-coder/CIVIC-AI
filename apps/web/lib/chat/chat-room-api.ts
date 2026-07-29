"use client";

import { z } from "zod";
import { chatFetch, type ChatFetch } from "./chat-fetch";
import {
  banRoomMemberResponseSchema,
  closeRoomResponseSchema,
  createRoomRequestSchema,
  createRoomResponseSchema,
  cursorPaginationParamsSchema,
  idempotencyKeySchema,
  joinRoomResponseSchema,
  leaveRoomResponseSchema,
  membershipStatusSchema,
  myRoomListResponseSchema,
  publicRoomListResponseSchema,
  roomDetailsSchema,
  roomIdSchema,
  roomMembershipListParamsSchema,
  roomMembershipListResponseSchema,
  roomMembershipSchema,
  targetUserRequestSchema,
  transferRoomOwnershipResponseSchema,
  unbanRoomMemberResponseSchema,
  type BanRoomMemberResponse,
  type CloseRoomResponse,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type CursorPaginationParams,
  type JoinRoomResponse,
  type LeaveRoomResponse,
  type MyRoomListResponse,
  type PublicRoomListResponse,
  type RoomDetails,
  type RoomMembership,
  type RoomMembershipListParams,
  type RoomMembershipListResponse,
  type TargetUserRequest,
  type TransferRoomOwnershipResponse,
  type UnbanRoomMemberResponse,
} from "./chat-room-contracts";
import type { IdempotentCommand } from "./idempotent-command";

export class ChatRestContractError extends Error {
  override readonly name = "ChatRestContractError";

  constructor(
    readonly contract: string,
    readonly validationError: z.ZodError,
  ) {
    super(`Chat REST 응답이 ${contract} 계약과 일치하지 않습니다.`, {
      cause: validationError,
    });
  }
}

export type ChatRoomApi = Readonly<{
  createRoom(command: IdempotentCommand<CreateRoomRequest>): Promise<CreateRoomResponse>;
  joinRoom(roomId: string, command: IdempotentCommand<undefined>): Promise<JoinRoomResponse>;
  leaveRoom(roomId: string, command: IdempotentCommand<undefined>): Promise<LeaveRoomResponse>;
  transferRoomOwnership(
    roomId: string,
    command: IdempotentCommand<TargetUserRequest>,
  ): Promise<TransferRoomOwnershipResponse>;
  banRoomMember(
    roomId: string,
    command: IdempotentCommand<TargetUserRequest>,
  ): Promise<BanRoomMemberResponse>;
  unbanRoomMember(
    roomId: string,
    command: IdempotentCommand<TargetUserRequest>,
  ): Promise<UnbanRoomMemberResponse>;
  closeRoom(roomId: string, command: IdempotentCommand<undefined>): Promise<CloseRoomResponse>;
  listPublicRooms(params?: CursorPaginationParams): Promise<PublicRoomListResponse>;
  getRoom(roomId: string): Promise<RoomDetails>;
  getMyMembership(roomId: string): Promise<RoomMembership>;
  listMyRooms(params?: CursorPaginationParams): Promise<MyRoomListResponse>;
  listRoomMemberships(
    roomId: string,
    params?: RoomMembershipListParams,
  ): Promise<RoomMembershipListResponse>;
}>;

export function createChatRoomApi(request: ChatFetch = chatFetch): ChatRoomApi {
  return {
    async createRoom(command) {
      const body = createRoomRequestSchema.parse(command.body);

      return requestAndParse(request, "방 생성 응답", createRoomResponseSchema, "/rooms", {
        method: "POST",
        headers: createCommandHeaders(command.idempotencyKey, true),
        body: JSON.stringify(body),
      });
    },

    async joinRoom(roomId, command) {
      return requestAndParse(
        request,
        "방 참여 응답",
        joinRoomResponseSchema,
        `${createRoomPath(roomId)}/commands/join`,
        {
          method: "POST",
          headers: createCommandHeaders(command.idempotencyKey),
        },
      );
    },

    async leaveRoom(roomId, command) {
      return requestAndParse(
        request,
        "방 나가기 응답",
        leaveRoomResponseSchema,
        `${createRoomPath(roomId)}/commands/leave`,
        {
          method: "POST",
          headers: createCommandHeaders(command.idempotencyKey),
        },
      );
    },

    async transferRoomOwnership(roomId, command) {
      const body = targetUserRequestSchema.parse(command.body);

      return requestAndParse(
        request,
        "방장 위임 응답",
        transferRoomOwnershipResponseSchema,
        `${createRoomPath(roomId)}/commands/transfer-ownership`,
        {
          method: "POST",
          headers: createCommandHeaders(command.idempotencyKey, true),
          body: JSON.stringify(body),
        },
      );
    },

    async banRoomMember(roomId, command) {
      const body = targetUserRequestSchema.parse(command.body);

      return requestAndParse(
        request,
        "멤버 차단 응답",
        banRoomMemberResponseSchema,
        `${createRoomPath(roomId)}/commands/ban-member`,
        {
          method: "POST",
          headers: createCommandHeaders(command.idempotencyKey, true),
          body: JSON.stringify(body),
        },
      );
    },

    async unbanRoomMember(roomId, command) {
      const body = targetUserRequestSchema.parse(command.body);

      return requestAndParse(
        request,
        "멤버 차단 해제 응답",
        unbanRoomMemberResponseSchema,
        `${createRoomPath(roomId)}/commands/unban-member`,
        {
          method: "POST",
          headers: createCommandHeaders(command.idempotencyKey, true),
          body: JSON.stringify(body),
        },
      );
    },

    async closeRoom(roomId, command) {
      return requestAndParse(
        request,
        "방 종료 응답",
        closeRoomResponseSchema,
        `${createRoomPath(roomId)}/commands/close`,
        {
          method: "POST",
          headers: createCommandHeaders(command.idempotencyKey),
        },
      );
    },

    async listPublicRooms(params = {}) {
      return requestAndParse(
        request,
        "공개 방 목록 응답",
        publicRoomListResponseSchema,
        createListPath("/rooms", cursorPaginationParamsSchema.parse(params)),
      );
    },

    async getRoom(roomId) {
      return requestAndParse(request, "방 상세 응답", roomDetailsSchema, createRoomPath(roomId));
    },

    async getMyMembership(roomId) {
      return requestAndParse(
        request,
        "내 멤버십 응답",
        roomMembershipSchema,
        `${createRoomPath(roomId)}/memberships/me`,
      );
    },

    async listMyRooms(params = {}) {
      return requestAndParse(
        request,
        "내 활성 방 목록 응답",
        myRoomListResponseSchema,
        createListPath("/me/rooms", cursorPaginationParamsSchema.parse(params)),
      );
    },

    async listRoomMemberships(roomId, params = {}) {
      const parsedParams = roomMembershipListParamsSchema.parse(params);

      return requestAndParse(
        request,
        "방 멤버 목록 응답",
        roomMembershipListResponseSchema,
        createListPath(`${createRoomPath(roomId)}/memberships`, parsedParams),
      );
    },
  };
}

export const chatRoomApi = createChatRoomApi();

async function requestAndParse<TSchema extends z.ZodType>(
  request: ChatFetch,
  contract: string,
  schema: TSchema,
  path: string,
  init?: RequestInit,
): Promise<z.output<TSchema>> {
  const response = await request<unknown>(path, init);
  const result = schema.safeParse(response);

  if (!result.success) {
    throw new ChatRestContractError(contract, result.error);
  }

  return result.data;
}

function createCommandHeaders(idempotencyKey: string, hasBody = false): Headers {
  const headers = new Headers({
    "Idempotency-Key": idempotencyKeySchema.parse(idempotencyKey),
  });

  if (hasBody) {
    headers.set("Content-Type", "application/json");
  }

  return headers;
}

function createRoomPath(roomId: string): string {
  return `/rooms/${roomIdSchema.parse(roomId)}`;
}

function createListPath(
  path: string,
  params: {
    cursor?: string | undefined;
    limit?: number | undefined;
    status?: z.infer<typeof membershipStatusSchema> | undefined;
  },
): string {
  const searchParams = new URLSearchParams();

  if (params.status !== undefined) {
    searchParams.set("status", params.status);
  }

  if (params.cursor !== undefined) {
    searchParams.set("cursor", params.cursor);
  }

  if (params.limit !== undefined) {
    searchParams.set("limit", String(params.limit));
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}
