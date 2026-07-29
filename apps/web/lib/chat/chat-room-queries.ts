"use client";

import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { chatRoomApi, type ChatRoomApi } from "./chat-room-api";
import type { MembershipStatus } from "./chat-room-contracts";

const DEFAULT_LIST_LIMIT = 20;

export type ChatRoomListQueryParams = Readonly<{
  limit?: number;
}>;

export type ChatRoomMembershipListQueryParams = Readonly<{
  status?: MembershipStatus;
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
  { status = "ACTIVE", limit = DEFAULT_LIST_LIMIT }: ChatRoomMembershipListQueryParams = {},
  api: Pick<ChatRoomApi, "listRoomMemberships"> = chatRoomApi,
) {
  return infiniteQueryOptions({
    queryKey: chatRoomQueryKeys.membershipList(roomId, status, limit),
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

export function usePublicRoomsQuery(params: ChatRoomListQueryParams = {}) {
  return useInfiniteQuery(publicRoomsInfiniteQueryOptions(params));
}

export function useMyRoomsQuery(params: ChatRoomListQueryParams = {}) {
  return useInfiniteQuery(myRoomsInfiniteQueryOptions(params));
}

export function useRoomDetailsQuery(roomId: string) {
  return useQuery(roomDetailsQueryOptions(roomId));
}

export function useMyRoomMembershipQuery(roomId: string) {
  return useQuery(myRoomMembershipQueryOptions(roomId));
}

export function useRoomMembershipsQuery(
  roomId: string,
  params: ChatRoomMembershipListQueryParams = {},
) {
  return useInfiniteQuery(roomMembershipsInfiniteQueryOptions(roomId, params));
}
