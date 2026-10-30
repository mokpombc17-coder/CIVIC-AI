"use client";

import { useCallback, useMemo } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MyRoomListItem,
  PublicRoomListItem,
  RoomCreationRequestResponse,
  RoomInboxListItem,
  RoomMembershipListItem,
} from "./chat-room-contracts";
import {
  chatRoomQueryKeys,
  type ChatMessageHistoryQueryParams,
  type ChatRoomListQueryParams,
  type ChatRoomMembershipListQueryParams,
  type ChatRoomMessageContextQueryParams,
  type ChatRoomMessageSearchQueryParams,
  type ChatRoomParticipationQueryParams,
  type ChatRoomQueryParams,
  type ChatRoomReadReceiptStateQueryParams,
  type InvalidCursorRecoveryState,
  type PublicRoomInvalidCursorRecoveryState,
  type PublicRoomListQueryParams,
} from "./chat-room-query-keys";
import {
  myRoomCreationRequestQueryOptions,
  myRoomCreationRequestsInfiniteQueryOptions,
  myRoomMembershipQueryOptions,
  myRoomsInfiniteQueryOptions,
  publicRoomsInfiniteQueryOptions,
  roomDetailsQueryOptions,
  roomInboxInfiniteQueryOptions,
  roomMembershipsInfiniteQueryOptions,
  roomMessageContextQueryOptions,
  roomMessageHistoryInfiniteQueryOptions,
  roomMessageSearchInfiniteQueryOptions,
  roomParticipationsQueryOptions,
  roomReadReceiptStateQueryOptions,
} from "./chat-room-query-options";
import {
  flattenRoomListPages,
  flattenRoomMessageHistoryPages,
  flattenRoomMessageSearchPages,
  recoverPublicRoomInvalidCursorOnce,
  recoverRoomCreationRequestInvalidCursorOnce,
  refreshPublicRoomListFromFirstPage,
} from "./chat-room-query-policies";
import {
  createEmptyChatRoomSystemActivityJournal,
  type ChatRoomSystemActivityJournal,
} from "./realtime/chat-room-system-activity";

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

  const { queryKey } = options;
  const refreshFromFirstPage = useCallback(
    () => void refreshPublicRoomListFromFirstPage(queryClient, queryKey),
    // queryKey는 render마다 새 배열이므로 같은 검색 조건을 뜻하는 recoveryKey로 대신함
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, recoveryKey],
  );

  return {
    ...query,
    fetchNextPage,
    // 공개방이 바뀌었다는 신호로 다시 받아야 한다는 표시가 남았고 아직 다시 받는 중이 아님
    needsRefresh: query.isStale && !query.isFetching && query.data !== undefined,
    refreshFromFirstPage,
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
  const queryClient = useQueryClient();
  const options = myRoomCreationRequestsInfiniteQueryOptions(params);
  const query = useInfiniteQuery(options);
  const recoveryKey = JSON.stringify(options.queryKey);
  const recovery = useMemo<InvalidCursorRecoveryState>(
    () => ({ attempted: false }),
    // recoveryKey가 바뀌면 새 목록 조건이므로 one-shot cursor 복구 상태도 초기화한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recoveryKey],
  );
  const requests = useMemo(
    () => flattenRoomListPages<RoomCreationRequestResponse>(query.data?.pages),
    [query.data?.pages],
  );
  const fetchNextPage: typeof query.fetchNextPage = async (fetchOptions) => {
    const result = await query.fetchNextPage(fetchOptions);

    await recoverRoomCreationRequestInvalidCursorOnce(
      queryClient,
      options.queryKey,
      result.error,
      recovery,
    );

    return result;
  };

  return {
    ...query,
    fetchNextPage,
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

export function useRoomParticipationsQuery(
  roomId: string,
  params: ChatRoomParticipationQueryParams,
) {
  return useQuery(roomParticipationsQueryOptions(roomId, params));
}

export function useRoomSystemActivityJournalQuery(roomId: string) {
  return useQuery({
    queryKey: chatRoomQueryKeys.systemActivityJournal(roomId),
    queryFn: async (): Promise<ChatRoomSystemActivityJournal> =>
      createEmptyChatRoomSystemActivityJournal(roomId),
    enabled: false,
    initialData: () => createEmptyChatRoomSystemActivityJournal(roomId),
    staleTime: Number.POSITIVE_INFINITY,
  });
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
