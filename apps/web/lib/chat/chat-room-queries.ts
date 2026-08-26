"use client";

import { useMemo } from "react";
import {
  infiniteQueryOptions,
  queryOptions,
  type QueryClient,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { mergePresortedChatMessages } from "./chat-message-merge";
import { ChatApiError } from "./chat-fetch";
import { chatRoomApi, type ChatRoomApi } from "./chat-room-api";
import {
  publicRoomListParamsSchema,
  roomMessageContextParamsSchema,
  roomMessageSearchRequestSchema,
} from "./chat-room-contracts";
import { normalizeRoomReadReceiptState } from "./chat-room-read-receipt-state";
import type {
  ChatMessage,
  MembershipStatus,
  MessageHistoryResponse,
  MyRoomListItem,
  PublicRoomListItem,
  RoomCategory,
  RoomInboxListItem,
  RoomInboxListResponse,
  RoomMembershipListItem,
  RoomMessageSearchResponse,
  RoomCreationRequestResponse,
} from "./chat-room-contracts";

const DEFAULT_LIST_LIMIT = 20;
const ROOM_INBOX_RETRY_BASE_DELAY_MS = 500;
const ROOM_INBOX_RETRY_MAX_DELAY_MS = 2_000;
const ROOM_INBOX_MAX_RETRIES = 3;
const ROOM_READ_RECEIPT_STATE_MAX_RETRIES = 3;
export const DEFAULT_MESSAGE_HISTORY_LIMIT = 50;
export const DEFAULT_ROOM_MESSAGE_SEARCH_LIMIT = 20;
export const DEFAULT_ROOM_MESSAGE_CONTEXT_SIZE = 20;
const EMPTY_CHAT_MESSAGES: readonly ChatMessage[] = [];
const EMPTY_ROOM_LIST_ITEMS: readonly never[] = [];

export type ChatRoomListQueryParams = Readonly<{
  limit?: number;
}>;

export type PublicRoomListQueryParams = Readonly<{
  query?: string;
  category?: RoomCategory;
  limit?: number;
}>;

export type PublicRoomListCriteria = Readonly<{
  query?: string;
  category?: RoomCategory;
  joinPolicy: "OPEN";
  limit: number;
}>;

export type PublicRoomInvalidCursorRecoveryState = {
  attempted: boolean;
};

export type ChatRoomMembershipListQueryParams = Readonly<{
  enabled?: boolean;
  status?: MembershipStatus;
  limit?: number;
}>;

export type ChatRoomQueryParams = Readonly<{
  enabled?: boolean;
}>;

export type ChatMessageHistoryQueryParams = Readonly<{
  enabled: boolean;
  limit?: number;
}>;

export type ChatRoomReadReceiptStateQueryParams = Readonly<{
  enabled: boolean;
  generation: number;
}>;

export type ChatRoomMessageSearchQueryParams = Readonly<{
  enabled: boolean;
  generation: number;
  sessionGeneration?: number;
  query: string;
  limit?: number;
}>;

export type ChatRoomMessageSearchCriteria = Readonly<{
  generation: number;
  sessionGeneration: number;
  query: string;
  limit: number;
}>;

export type ChatRoomMessageContextQueryParams = Readonly<{
  enabled: boolean;
  generation: number;
  before?: number;
  after?: number;
}>;

export const chatRoomQueryKeys = {
  all: ["chat", "rooms"] as const,
  publicLists: () => [...chatRoomQueryKeys.all, "public-list"] as const,
  publicList: (criteria: PublicRoomListCriteria) =>
    [...chatRoomQueryKeys.publicLists(), criteria] as const,
  myLists: () => [...chatRoomQueryKeys.all, "my-list"] as const,
  myList: (limit: number) => [...chatRoomQueryKeys.myLists(), { limit }] as const,
  creationRequests: () => [...chatRoomQueryKeys.all, "creation-request"] as const,
  creationRequestLists: () => [...chatRoomQueryKeys.creationRequests(), "list"] as const,
  creationRequestList: (limit: number) =>
    [...chatRoomQueryKeys.creationRequestLists(), { limit }] as const,
  creationRequestDetails: () => [...chatRoomQueryKeys.creationRequests(), "detail"] as const,
  creationRequestDetail: (creationRequestId: string) =>
    [...chatRoomQueryKeys.creationRequestDetails(), creationRequestId] as const,
  roomInboxes: () => [...chatRoomQueryKeys.all, "room-inbox"] as const,
  roomInbox: (limit: number) => [...chatRoomQueryKeys.roomInboxes(), { limit }] as const,
  details: () => [...chatRoomQueryKeys.all, "detail"] as const,
  detail: (roomId: string) => [...chatRoomQueryKeys.details(), roomId] as const,
  myMemberships: () => [...chatRoomQueryKeys.all, "my-membership"] as const,
  myMembership: (roomId: string) => [...chatRoomQueryKeys.myMemberships(), roomId] as const,
  membershipLists: (roomId: string) =>
    [...chatRoomQueryKeys.all, "membership-list", roomId] as const,
  membershipList: (roomId: string, status: MembershipStatus, limit: number) =>
    [...chatRoomQueryKeys.membershipLists(roomId), { status, limit }] as const,
  messageHistories: () => [...chatRoomQueryKeys.all, "message-history"] as const,
  messageHistoriesForRoom: (roomId: string) =>
    [...chatRoomQueryKeys.messageHistories(), roomId] as const,
  messageHistory: (roomId: string, limit: number) =>
    [...chatRoomQueryKeys.messageHistoriesForRoom(roomId), { limit }] as const,
  messageSearches: () => [...chatRoomQueryKeys.all, "message-search"] as const,
  messageSearchesForRoom: (roomId: string) =>
    [...chatRoomQueryKeys.messageSearches(), roomId] as const,
  messageSearch: (roomId: string, criteria: ChatRoomMessageSearchCriteria) =>
    [...chatRoomQueryKeys.messageSearchesForRoom(roomId), criteria] as const,
  messageContexts: () => [...chatRoomQueryKeys.all, "message-context"] as const,
  messageContextsForRoom: (roomId: string) =>
    [...chatRoomQueryKeys.messageContexts(), roomId] as const,
  messageContext: (
    roomId: string,
    messageId: string,
    generation: number,
    before: number,
    after: number,
  ) =>
    [
      ...chatRoomQueryKeys.messageContextsForRoom(roomId),
      messageId,
      { generation, before, after },
    ] as const,
  roomEventJournals: () => [...chatRoomQueryKeys.all, "room-event-journal"] as const,
  roomEventJournal: (roomId: string) => [...chatRoomQueryKeys.roomEventJournals(), roomId] as const,
  readReceiptStates: () => [...chatRoomQueryKeys.all, "read-receipt-state"] as const,
  readReceiptStatesForRoom: (roomId: string) =>
    [...chatRoomQueryKeys.readReceiptStates(), roomId] as const,
  readReceiptState: (roomId: string, generation: number) =>
    [...chatRoomQueryKeys.readReceiptStatesForRoom(roomId), { generation }] as const,
};

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
  category,
  limit = DEFAULT_LIST_LIMIT,
}: PublicRoomListQueryParams = {}): PublicRoomListCriteria {
  const parsed = publicRoomListParamsSchema.parse({
    query,
    category,
    joinPolicy: "OPEN",
    limit,
  });

  return {
    ...(parsed.query === undefined ? {} : { query: parsed.query }),
    ...(parsed.category === undefined ? {} : { category: parsed.category }),
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
  });
}

export function roomInboxInfiniteQueryOptions(
  { limit = DEFAULT_LIST_LIMIT }: ChatRoomListQueryParams = {},
  api: Pick<ChatRoomApi, "listRoomInbox"> = chatRoomApi,
) {
  return infiniteQueryOptions({
    queryKey: chatRoomQueryKeys.roomInbox(limit),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.listRoomInbox({
        limit,
        ...(pageParam === null ? {} : { cursor: pageParam }),
      }),
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
    queryFn: () => api.getRoom(roomId),
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

export function roomMessageHistoryInfiniteQueryOptions(
  roomId: string,
  { enabled, limit = DEFAULT_MESSAGE_HISTORY_LIMIT }: ChatMessageHistoryQueryParams,
  api: Pick<ChatRoomApi, "getRoomMessages"> = chatRoomApi,
) {
  return infiniteQueryOptions({
    queryKey: chatRoomQueryKeys.messageHistory(roomId, limit),
    enabled,
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) =>
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

export function flattenRoomMessageHistoryPages(
  roomId: string,
  pages: readonly MessageHistoryResponse[] | undefined,
): readonly ChatMessage[] {
  if (!pages || pages.length === 0) {
    return EMPTY_CHAT_MESSAGES;
  }

  return mergePresortedChatMessages({
    roomId,
    sources: [...pages].reverse().map((page) => page.items),
  }).messages;
}

export function flattenRoomMessageSearchPages(
  pages: readonly RoomMessageSearchResponse[] | undefined,
): readonly ChatMessage[] {
  if (!pages || pages.length === 0) {
    return EMPTY_CHAT_MESSAGES;
  }

  const messageIds = new Set<string>();

  return pages
    .flatMap((page) => page.items)
    .filter((message) => {
      if (messageIds.has(message.messageId)) {
        return false;
      }

      messageIds.add(message.messageId);
      return true;
    })
    .sort((left, right) => right.roomSequence - left.roomSequence);
}

export function usePublicRoomsQuery(params: PublicRoomListQueryParams = {}) {
  const queryClient = useQueryClient();
  const options = publicRoomsInfiniteQueryOptions(params);
  const query = useInfiniteQuery(options);
  const recoveryKey = JSON.stringify(options.queryKey);
  const recovery = useMemo<PublicRoomInvalidCursorRecoveryState>(
    () => ({ attempted: false }),
    // recoveryKey가 바뀌면 새 검색 조건이므로 one-shot cursor 복구 상태도 초기화한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recoveryKey],
  );

  const rooms = useMemo(
    () => flattenRoomListPages<PublicRoomListItem>(query.data?.pages),
    [query.data?.pages],
  );
  const fetchNextPage: typeof query.fetchNextPage = async (fetchOptions) => {
    const result = await query.fetchNextPage(fetchOptions);

    await recoverPublicRoomInvalidCursorOnce(queryClient, options.queryKey, result.error, recovery);

    return result;
  };

  return {
    ...query,
    fetchNextPage,
    rooms,
  };
}

export function useMyRoomsQuery(params: ChatRoomListQueryParams = {}) {
  const query = useInfiniteQuery(myRoomsInfiniteQueryOptions(params));
  const rooms = useMemo(
    () => flattenRoomListPages<MyRoomListItem>(query.data?.pages),
    [query.data?.pages],
  );

  return {
    ...query,
    rooms,
  };
}

export function useMyRoomCreationRequestsQuery(params: ChatRoomListQueryParams = {}) {
  const query = useInfiniteQuery(myRoomCreationRequestsInfiniteQueryOptions(params));
  const requests = useMemo(
    () => flattenRoomListPages<RoomCreationRequestResponse>(query.data?.pages),
    [query.data?.pages],
  );

  return {
    ...query,
    requests,
  };
}

export function useMyRoomCreationRequestQuery(creationRequestId: string) {
  return useQuery(myRoomCreationRequestQueryOptions(creationRequestId));
}

export function useRoomInboxQuery(params: ChatRoomListQueryParams = {}) {
  const query = useInfiniteQuery(roomInboxInfiniteQueryOptions(params));
  const rooms = useMemo(
    () => flattenRoomListPages<RoomInboxListItem>(query.data?.pages),
    [query.data?.pages],
  );

  return {
    ...query,
    rooms,
  };
}

export function useRoomDetailsQuery(roomId: string) {
  return useQuery(roomDetailsQueryOptions(roomId));
}

export function useRoomReadReceiptStateQuery(
  roomId: string,
  params: ChatRoomReadReceiptStateQueryParams,
) {
  return useQuery(roomReadReceiptStateQueryOptions(roomId, params));
}

export function useMyRoomMembershipQuery(
  roomId: string,
  { enabled = true }: ChatRoomQueryParams = {},
) {
  return useQuery({
    ...myRoomMembershipQueryOptions(roomId),
    enabled,
  });
}

export function useRoomMembershipsQuery(
  roomId: string,
  params: ChatRoomMembershipListQueryParams = {},
) {
  const query = useInfiniteQuery(roomMembershipsInfiniteQueryOptions(roomId, params));
  const memberships = useMemo(
    () => flattenRoomListPages<RoomMembershipListItem>(query.data?.pages),
    [query.data?.pages],
  );

  return {
    ...query,
    memberships,
  };
}

export function useRoomMessageHistoryQuery(roomId: string, params: ChatMessageHistoryQueryParams) {
  const query = useInfiniteQuery(roomMessageHistoryInfiniteQueryOptions(roomId, params));
  const messages = useMemo(
    () => flattenRoomMessageHistoryPages(roomId, query.data?.pages),
    [query.data?.pages, roomId],
  );

  return {
    ...query,
    messages,
  };
}

export function useRoomMessageSearchQuery(
  roomId: string,
  params: ChatRoomMessageSearchQueryParams,
) {
  const query = useInfiniteQuery(roomMessageSearchInfiniteQueryOptions(roomId, params));
  const messages = useMemo(
    () => flattenRoomMessageSearchPages(query.data?.pages),
    [query.data?.pages],
  );

  return {
    ...query,
    messages,
  };
}

export function useRoomMessageContextQuery(
  roomId: string,
  messageId: string,
  params: ChatRoomMessageContextQueryParams,
) {
  return useQuery(roomMessageContextQueryOptions(roomId, messageId, params));
}

export function flattenRoomListPages<TItem>(
  pages: readonly { items: readonly TItem[] }[] | undefined,
): readonly TItem[] {
  if (!pages || pages.length === 0) {
    return EMPTY_ROOM_LIST_ITEMS;
  }

  return pages.flatMap((page) => page.items);
}

export async function recoverPublicRoomInvalidCursorOnce(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  error: unknown,
  state: PublicRoomInvalidCursorRecoveryState,
): Promise<boolean> {
  if (state.attempted || !(error instanceof ChatApiError) || error.code !== "INVALID_CURSOR") {
    return false;
  }

  state.attempted = true;
  await queryClient.resetQueries(
    {
      queryKey,
      exact: true,
    },
    {
      cancelRefetch: true,
    },
  );
  return true;
}

export function shouldRetryPublicRoomRequest(failureCount: number, error: Error): boolean {
  if (failureCount >= 1) {
    return false;
  }

  return !(error instanceof ChatApiError) || error.retryable;
}

export function getNextRoomInboxPageParam(
  lastPage: RoomInboxListResponse,
  _allPages: readonly RoomInboxListResponse[],
  _lastPageParam: string | null,
  allPageParams: readonly (string | null)[],
): string | null {
  if (!lastPage.hasNext || lastPage.nextCursor === null) {
    return null;
  }

  return allPageParams.includes(lastPage.nextCursor) ? null : lastPage.nextCursor;
}

export function shouldRetryRoomInboxRequest(failureCount: number, error: Error): boolean {
  return failureCount < ROOM_INBOX_MAX_RETRIES && error instanceof ChatApiError && error.retryable;
}

export function shouldRetryRoomReadReceiptStateRequest(
  failureCount: number,
  error: Error,
): boolean {
  return (
    failureCount < ROOM_READ_RECEIPT_STATE_MAX_RETRIES &&
    error instanceof ChatApiError &&
    error.retryable
  );
}

export function getRoomInboxRetryDelay(
  attemptIndex: number,
  random: () => number = Math.random,
): number {
  const delay = Math.min(
    ROOM_INBOX_RETRY_BASE_DELAY_MS * 2 ** attemptIndex,
    ROOM_INBOX_RETRY_MAX_DELAY_MS,
  );
  const jitterMultiplier = 0.75 + random() * 0.5;
  return Math.round(delay * jitterMultiplier);
}
