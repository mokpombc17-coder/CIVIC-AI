import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { chatRoomApi, type ChatRoomApi } from "./chat-room-api";
import {
  publicRoomListParamsSchema,
  roomMessageContextParamsSchema,
  roomMessageSearchRequestSchema,
} from "./chat-room-contracts";
import {
  chatRoomQueryKeys,
  DEFAULT_MESSAGE_HISTORY_LIMIT,
  DEFAULT_ROOM_MESSAGE_CONTEXT_SIZE,
  DEFAULT_ROOM_MESSAGE_SEARCH_LIMIT,
  type ChatMessageHistoryQueryParams,
  type ChatRoomListQueryParams,
  type ChatRoomMembershipListQueryParams,
  type ChatRoomMessageContextQueryParams,
  type ChatRoomMessageSearchCriteria,
  type ChatRoomMessageSearchQueryParams,
  type ChatRoomParticipationQueryParams,
  type ChatRoomReadReceiptStateQueryParams,
  type PublicRoomListCriteria,
  type PublicRoomListQueryParams,
} from "./chat-room-query-keys";
import {
  getNextRoomInboxPageParam,
  getRoomInboxRetryDelay,
  shouldRetryPublicRoomRequest,
  shouldRetryRoomInboxRequest,
  shouldRetryRoomReadReceiptStateRequest,
} from "./chat-room-query-policies";
import { normalizeRoomReadReceiptState } from "./chat-room-read-receipt-state";

const DEFAULT_LIST_LIMIT = 20;

export function publicRoomsInfiniteQueryOptions(
  params: PublicRoomListQueryParams = {},
  api: Pick<ChatRoomApi, "listPublicRooms"> = chatRoomApi,
) {
  const criteria = normalizePublicRoomListCriteria(params);

  return infiniteQueryOptions({
    queryKey: chatRoomQueryKeys.publicList(criteria),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api.listPublicRooms(
        {
          ...criteria,
          ...(pageParam === null ? {} : { cursor: pageParam }),
        },
        signal,
      ),
    getNextPageParam: (lastPage) => (lastPage.hasNext ? lastPage.nextCursor : null),
    retry: shouldRetryPublicRoomRequest,
  });
}

export function normalizePublicRoomListCriteria({
  query,
  categoryId,
  limit = DEFAULT_LIST_LIMIT,
}: PublicRoomListQueryParams = {}): PublicRoomListCriteria {
  const parsed = publicRoomListParamsSchema.parse({
    query,
    categoryId,
    joinPolicy: "OPEN",
    limit,
  });

  return {
    ...(parsed.query === undefined ? {} : { query: parsed.query }),
    ...(parsed.categoryId === undefined ? {} : { categoryId: parsed.categoryId }),
    joinPolicy: "OPEN",
    limit: parsed.limit ?? DEFAULT_LIST_LIMIT,
  };
}

export function myRoomsInfiniteQueryOptions(
  { limit = DEFAULT_LIST_LIMIT }: ChatRoomListQueryParams = {},
  api: Pick<ChatRoomApi, "listMyRooms"> = chatRoomApi,
) {
  return infiniteQueryOptions({
    queryKey: chatRoomQueryKeys.myList(limit),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.listMyRooms({
        limit,
        ...(pageParam === null ? {} : { cursor: pageParam }),
      }),
    getNextPageParam: (lastPage) => (lastPage.hasNext ? lastPage.nextCursor : null),
  });
}

export function myRoomCreationRequestsInfiniteQueryOptions(
  { limit = DEFAULT_LIST_LIMIT }: ChatRoomListQueryParams = {},
  api: Pick<ChatRoomApi, "listMyRoomCreationRequests"> = chatRoomApi,
) {
  return infiniteQueryOptions({
    queryKey: chatRoomQueryKeys.creationRequestList(limit),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api.listMyRoomCreationRequests(
        {
          limit,
          ...(pageParam === null ? {} : { cursor: pageParam }),
        },
        signal,
      ),
    getNextPageParam: (lastPage) => (lastPage.hasNext ? lastPage.nextCursor : null),
  });
}

export function myRoomCreationRequestQueryOptions(
  creationRequestId: string,
  api: Pick<ChatRoomApi, "getMyRoomCreationRequest"> = chatRoomApi,
) {
  return queryOptions({
    queryKey: chatRoomQueryKeys.creationRequestDetail(creationRequestId),
    queryFn: ({ signal }) => api.getMyRoomCreationRequest(creationRequestId, signal),
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function roomInboxInfiniteQueryOptions(
  { limit = DEFAULT_LIST_LIMIT }: ChatRoomListQueryParams = {},
  api: Pick<ChatRoomApi, "listRoomInbox"> = chatRoomApi,
) {
  return infiniteQueryOptions({
    queryKey: chatRoomQueryKeys.roomInbox(limit),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api.listRoomInbox(
        {
          limit,
          ...(pageParam === null ? {} : { cursor: pageParam }),
        },
        signal,
      ),
    getNextPageParam: getNextRoomInboxPageParam,
    retry: shouldRetryRoomInboxRequest,
    retryDelay: (attemptIndex) => getRoomInboxRetryDelay(attemptIndex),
  });
}

export function roomDetailsQueryOptions(
  roomId: string,
  api: Pick<ChatRoomApi, "getRoom"> = chatRoomApi,
) {
  return queryOptions({
    queryKey: chatRoomQueryKeys.detail(roomId),
    queryFn: ({ signal }) => api.getRoom(roomId, signal),
  });
}

export function roomReadReceiptStateQueryOptions(
  roomId: string,
  { enabled, generation }: ChatRoomReadReceiptStateQueryParams,
  api: Pick<ChatRoomApi, "getRoomReadReceiptState"> = chatRoomApi,
) {
  return queryOptions({
    queryKey: chatRoomQueryKeys.readReceiptState(roomId, generation),
    enabled,
    queryFn: async ({ signal }) =>
      normalizeRoomReadReceiptState(await api.getRoomReadReceiptState(roomId, signal)),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: shouldRetryRoomReadReceiptStateRequest,
  });
}

export function myRoomMembershipQueryOptions(
  roomId: string,
  api: Pick<ChatRoomApi, "getMyMembership"> = chatRoomApi,
) {
  return queryOptions({
    queryKey: chatRoomQueryKeys.myMembership(roomId),
    queryFn: () => api.getMyMembership(roomId),
  });
}

export function roomMembershipsInfiniteQueryOptions(
  roomId: string,
  {
    enabled = true,
    status = "ACTIVE",
    limit = DEFAULT_LIST_LIMIT,
  }: ChatRoomMembershipListQueryParams = {},
  api: Pick<ChatRoomApi, "listRoomMemberships"> = chatRoomApi,
) {
  return infiniteQueryOptions({
    queryKey: chatRoomQueryKeys.membershipList(roomId, status, limit),
    enabled,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.listRoomMemberships(roomId, {
        status,
        limit,
        ...(pageParam === null ? {} : { cursor: pageParam }),
      }),
    getNextPageParam: (lastPage) => (lastPage.hasNext ? lastPage.nextCursor : null),
  });
}

export function roomParticipationsQueryOptions(
  roomId: string,
  { enabled, generation }: ChatRoomParticipationQueryParams,
  api: Pick<ChatRoomApi, "listRoomParticipations"> = chatRoomApi,
) {
  return queryOptions({
    queryKey: chatRoomQueryKeys.participation(roomId, generation),
    enabled,
    queryFn: ({ signal }) => api.listRoomParticipations(roomId, signal),
    placeholderData: (previousData, previousQuery) =>
      retainPreviousRoomParticipationData(roomId, previousData, previousQuery?.queryKey),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
}

export function retainPreviousRoomParticipationData<T>(
  roomId: string,
  previousData: T | undefined,
  previousQueryKey: readonly unknown[] | undefined,
): T | undefined {
  const roomParticipationKey = chatRoomQueryKeys.participationsForRoom(roomId);

  if (previousQueryKey?.length !== roomParticipationKey.length + 1) {
    return undefined;
  }

  return roomParticipationKey.every((part, index) => previousQueryKey[index] === part)
    ? previousData
    : undefined;
}

export function roomMessageHistoryInfiniteQueryOptions(
  roomId: string,
  { enabled, limit = DEFAULT_MESSAGE_HISTORY_LIMIT }: ChatMessageHistoryQueryParams,
  api: Pick<ChatRoomApi, "getRoomMessages"> = chatRoomApi,
) {
  return infiniteQueryOptions({
    queryKey: chatRoomQueryKeys.messageHistory(roomId, limit),
    enabled,
    initialPageParam: null as number | null,
    queryFn: ({ pageParam, signal }) =>
      api.getRoomMessages(
        roomId,
        pageParam === null
          ? {
              mode: "latest",
              limit,
            }
          : {
              mode: "before",
              beforeSequence: pageParam,
              limit,
            },
        signal,
      ),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextBeforeSequence : null),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
}

export function roomMessageSearchInfiniteQueryOptions(
  roomId: string,
  {
    enabled,
    generation,
    sessionGeneration = 0,
    query,
    limit = DEFAULT_ROOM_MESSAGE_SEARCH_LIMIT,
  }: ChatRoomMessageSearchQueryParams,
  api: Pick<ChatRoomApi, "searchRoomMessages"> = chatRoomApi,
) {
  const request = roomMessageSearchRequestSchema.parse({
    query,
    cursor: null,
    limit,
  });
  const criteria: ChatRoomMessageSearchCriteria = {
    generation,
    sessionGeneration,
    query: request.query,
    limit: request.limit ?? DEFAULT_ROOM_MESSAGE_SEARCH_LIMIT,
  };

  return infiniteQueryOptions({
    queryKey: chatRoomQueryKeys.messageSearch(roomId, criteria),
    enabled,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api.searchRoomMessages(
        roomId,
        {
          query: criteria.query,
          cursor: pageParam,
          limit: criteria.limit,
        },
        signal,
      ),
    getNextPageParam: (lastPage) => (lastPage.searchComplete ? null : lastPage.nextCursor),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function roomMessageContextQueryOptions(
  roomId: string,
  messageId: string,
  {
    enabled,
    generation,
    before = DEFAULT_ROOM_MESSAGE_CONTEXT_SIZE,
    after = DEFAULT_ROOM_MESSAGE_CONTEXT_SIZE,
  }: ChatRoomMessageContextQueryParams,
  api: Pick<ChatRoomApi, "getRoomMessageContext"> = chatRoomApi,
) {
  const params = roomMessageContextParamsSchema.parse({ before, after });
  const normalizedBefore = params.before ?? DEFAULT_ROOM_MESSAGE_CONTEXT_SIZE;
  const normalizedAfter = params.after ?? DEFAULT_ROOM_MESSAGE_CONTEXT_SIZE;

  return queryOptions({
    queryKey: chatRoomQueryKeys.messageContext(
      roomId,
      messageId,
      generation,
      normalizedBefore,
      normalizedAfter,
    ),
    enabled,
    queryFn: ({ signal }) =>
      api.getRoomMessageContext(
        roomId,
        messageId,
        { before: normalizedBefore, after: normalizedAfter },
        signal,
      ),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
