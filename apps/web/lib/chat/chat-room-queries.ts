"use client";

import { useMemo } from "react";
import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { mergeChatMessages } from "./chat-message-merge";
import { chatRoomApi, type ChatRoomApi } from "./chat-room-api";
import type {
  ChatMessage,
  MembershipStatus,
  MessageHistoryResponse,
  MyRoomListItem,
  PublicRoomListItem,
  RoomMembershipListItem,
} from "./chat-room-contracts";

const DEFAULT_LIST_LIMIT = 20;
export const DEFAULT_MESSAGE_HISTORY_LIMIT = 50;
const EMPTY_CHAT_MESSAGES: readonly ChatMessage[] = [];
const EMPTY_ROOM_LIST_ITEMS: readonly never[] = [];

export type ChatRoomListQueryParams = Readonly<{
  limit?: number;
}>;

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

export const chatRoomQueryKeys = {
  all: ["chat", "rooms"] as const,
  publicLists: () => [...chatRoomQueryKeys.all, "public-list"] as const,
  publicList: (limit: number) => [...chatRoomQueryKeys.publicLists(), { limit }] as const,
  myLists: () => [...chatRoomQueryKeys.all, "my-list"] as const,
  myList: (limit: number) => [...chatRoomQueryKeys.myLists(), { limit }] as const,
  details: () => [...chatRoomQueryKeys.all, "detail"] as const,
  detail: (roomId: string) => [...chatRoomQueryKeys.details(), roomId] as const,
  myMemberships: () => [...chatRoomQueryKeys.all, "my-membership"] as const,
  myMembership: (roomId: string) => [...chatRoomQueryKeys.myMemberships(), roomId] as const,
  membershipLists: (roomId: string) =>
    [...chatRoomQueryKeys.all, "membership-list", roomId] as const,
  membershipList: (roomId: string, status: MembershipStatus, limit: number) =>
    [...chatRoomQueryKeys.membershipLists(roomId), { status, limit }] as const,
  messageHistories: () => [...chatRoomQueryKeys.all, "message-history"] as const,
  messageHistory: (roomId: string, limit: number) =>
    [...chatRoomQueryKeys.messageHistories(), roomId, { limit }] as const,
  roomEventJournals: () => [...chatRoomQueryKeys.all, "room-event-journal"] as const,
  roomEventJournal: (roomId: string) => [...chatRoomQueryKeys.roomEventJournals(), roomId] as const,
};

export function publicRoomsInfiniteQueryOptions(
  { limit = DEFAULT_LIST_LIMIT }: ChatRoomListQueryParams = {},
  api: Pick<ChatRoomApi, "listPublicRooms"> = chatRoomApi,
) {
  return infiniteQueryOptions({
    queryKey: chatRoomQueryKeys.publicList(limit),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.listPublicRooms({
        limit,
        ...(pageParam === null ? {} : { cursor: pageParam }),
      }),
    getNextPageParam: (lastPage) => (lastPage.hasNext ? lastPage.nextCursor : null),
  });
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

export function roomDetailsQueryOptions(
  roomId: string,
  api: Pick<ChatRoomApi, "getRoom"> = chatRoomApi,
) {
  return queryOptions({
    queryKey: chatRoomQueryKeys.detail(roomId),
    queryFn: () => api.getRoom(roomId),
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

export function flattenRoomMessageHistoryPages(
  roomId: string,
  pages: readonly MessageHistoryResponse[] | undefined,
): readonly ChatMessage[] {
  if (!pages || pages.length === 0) {
    return EMPTY_CHAT_MESSAGES;
  }

  return mergeChatMessages({
    roomId,
    sources: [...pages].reverse().map((page) => page.items),
  }).messages;
}

export function usePublicRoomsQuery(params: ChatRoomListQueryParams = {}) {
  const query = useInfiniteQuery(publicRoomsInfiniteQueryOptions(params));
  const rooms = useMemo(
    () => flattenRoomListPages<PublicRoomListItem>(query.data?.pages),
    [query.data?.pages],
  );

  return {
    ...query,
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

export function useRoomDetailsQuery(roomId: string) {
  return useQuery(roomDetailsQueryOptions(roomId));
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

export function flattenRoomListPages<TItem>(
  pages: readonly { items: readonly TItem[] }[] | undefined,
): readonly TItem[] {
  if (!pages || pages.length === 0) {
    return EMPTY_ROOM_LIST_ITEMS;
  }

  return pages.flatMap((page) => page.items);
}
