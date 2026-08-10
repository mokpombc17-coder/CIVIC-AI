"use client";

import { z } from "zod";
import { chatFetch, type ChatFetch } from "./chat-fetch";
import {
  banRoomMemberResponseSchema,
  closeRoomResponseSchema,
  createMessageHistoryResponseSchema,
  createRoomRequestSchema,
  createRoomResponseSchema,
  cursorPaginationParamsSchema,
  idempotencyKeySchema,
  joinRoomResponseSchema,
  leaveRoomResponseSchema,
  membershipStatusSchema,
  messageHistoryRequestSchema,
  myRoomListResponseSchema,
  publicRoomListParamsSchema,
  publicRoomListResponseSchema,
  roomDetailsSchema,
  roomIdSchema,
  roomInboxListParamsSchema,
  roomInboxListResponseSchema,
  roomMembershipListParamsSchema,
  roomMembershipListResponseSchema,
  roomMembershipSchema,
  roomReadReceiptStateResponseSchema,
  targetMembershipRequestSchema,
  transferRoomOwnershipResponseSchema,
  unbanRoomMemberResponseSchema,
  updateRoomReadStateRequestSchema,
  updateRoomReadStateResponseSchema,
  updateRoomSettingsRequestSchema,
  updateRoomSettingsResponseSchema,
  type BanRoomMemberResponse,
  type CloseRoomResponse,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type CursorPaginationParams,
  type JoinRoomResponse,
  type LeaveRoomResponse,
  type MessageHistoryRequest,
  type MessageHistoryResponse,
  type MyRoomListResponse,
  type JoinPolicy,
  type PublicRoomListResponse,
  type PublicRoomListParams,
  type RoomCategory,
  type RoomDetails,
  type RoomInboxListParams,
  type RoomInboxListResponse,
  type RoomMembership,
  type RoomMembershipListParams,
  type RoomMembershipListResponse,
  type RoomReadReceiptStateResponse,
  type TargetMembershipRequest,
  type TransferRoomOwnershipResponse,
  type UnbanRoomMemberResponse,
  type UpdateRoomReadStateRequest,
  type UpdateRoomReadStateResponse,
  type UpdateRoomSettingsRequest,
  type UpdateRoomSettingsResponse,
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
  updateRoomSettings(
    roomId: string,
    command: IdempotentCommand<UpdateRoomSettingsRequest>,
  ): Promise<UpdateRoomSettingsResponse>;
  joinRoom(roomId: string, command: IdempotentCommand<undefined>): Promise<JoinRoomResponse>;
  leaveRoom(roomId: string, command: IdempotentCommand<undefined>): Promise<LeaveRoomResponse>;
  transferRoomOwnership(
    roomId: string,
    command: IdempotentCommand<TargetMembershipRequest>,
  ): Promise<TransferRoomOwnershipResponse>;
  banRoomMember(
    roomId: string,
    command: IdempotentCommand<TargetMembershipRequest>,
  ): Promise<BanRoomMemberResponse>;
  unbanRoomMember(
    roomId: string,
    command: IdempotentCommand<TargetMembershipRequest>,
  ): Promise<UnbanRoomMemberResponse>;
  closeRoom(roomId: string, command: IdempotentCommand<undefined>): Promise<CloseRoomResponse>;
  listPublicRooms(
    params?: PublicRoomListParams,
    signal?: AbortSignal,
  ): Promise<PublicRoomListResponse>;
  getRoom(roomId: string): Promise<RoomDetails>;
  getMyMembership(roomId: string): Promise<RoomMembership>;
  listMyRooms(params?: CursorPaginationParams): Promise<MyRoomListResponse>;
  listRoomInbox(params?: RoomInboxListParams): Promise<RoomInboxListResponse>;
  updateRoomReadState(
    roomId: string,
    request: UpdateRoomReadStateRequest,
  ): Promise<UpdateRoomReadStateResponse>;
  getRoomReadReceiptState(
    roomId: string,
    signal?: AbortSignal,
  ): Promise<RoomReadReceiptStateResponse>;
  listRoomMemberships(
    roomId: string,
    params?: RoomMembershipListParams,
  ): Promise<RoomMembershipListResponse>;
  getRoomMessages(roomId: string, request?: MessageHistoryRequest): Promise<MessageHistoryResponse>;
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

    async updateRoomSettings(roomId, command) {
      const body = updateRoomSettingsRequestSchema.parse(command.body);

      return requestAndParse(
        request,
        "방 설정 변경 응답",
        updateRoomSettingsResponseSchema,
        `${createRoomPath(roomId)}/commands/update-settings`,
        {
          method: "POST",
          headers: createCommandHeaders(command.idempotencyKey, true),
          body: JSON.stringify(body),
        },
      );
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
      const body = targetMembershipRequestSchema.parse(command.body);

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
      const body = targetMembershipRequestSchema.parse(command.body);

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
      const body = targetMembershipRequestSchema.parse(command.body);

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

    async listPublicRooms(params = {}, signal) {
      return requestAndParse(
        request,
        "공개 방 목록 응답",
        publicRoomListResponseSchema,
        createListPath("/rooms", publicRoomListParamsSchema.parse(params)),
        signal ? { signal } : undefined,
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

    async listRoomInbox(params = {}) {
      return requestAndParse(
        request,
        "Room inbox 목록 응답",
        roomInboxListResponseSchema,
        createListPath("/me/room-inbox", roomInboxListParamsSchema.parse(params)),
      );
    },

    async updateRoomReadState(roomId, readStateRequest) {
      const body = updateRoomReadStateRequestSchema.parse(readStateRequest);

      return requestAndParse(
        request,
        "Room read-state 갱신 응답",
        updateRoomReadStateResponseSchema,
        `${createRoomPath(roomId)}/read-state`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
    },

    async getRoomReadReceiptState(roomId, signal) {
      return requestAndParse(
        request,
        "Room Read Receipt State 응답",
        roomReadReceiptStateResponseSchema,
        `${createRoomPath(roomId)}/read-receipts/state`,
        signal ? { signal } : undefined,
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

    async getRoomMessages(roomId, historyRequest = { mode: "latest" }) {
      const parsedRoomId = roomIdSchema.parse(roomId);
      const parsedRequest = messageHistoryRequestSchema.parse(historyRequest);

      return requestAndParse(
        request,
        `${parsedRequest.mode} 메시지 이력 응답`,
        createMessageHistoryResponseSchema(parsedRequest, parsedRoomId),
        createMessageHistoryPath(parsedRoomId, parsedRequest),
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

function createMessageHistoryPath(
  roomId: string,
  request: z.output<typeof messageHistoryRequestSchema>,
): string {
  const searchParams = new URLSearchParams();

  if (request.mode === "before") {
    searchParams.set("beforeSequence", String(request.beforeSequence));
  } else if (request.mode === "after") {
    searchParams.set("afterSequence", String(request.afterSequence));
  }

  searchParams.set("limit", String(request.limit ?? 50));

  return `/rooms/${roomId}/messages?${searchParams.toString()}`;
}

function createListPath(
  path: string,
  params: {
    cursor?: string | undefined;
    category?: RoomCategory | undefined;
    joinPolicy?: JoinPolicy | undefined;
    limit?: number | undefined;
    query?: string | undefined;
    status?: z.infer<typeof membershipStatusSchema> | undefined;
  },
): string {
  const searchParams = new URLSearchParams();

  if (params.joinPolicy !== undefined) {
    searchParams.set("joinPolicy", params.joinPolicy);
  }

  if (params.query !== undefined) {
    searchParams.set("query", params.query);
  }

  if (params.category !== undefined) {
    searchParams.set("category", params.category);
  }

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
