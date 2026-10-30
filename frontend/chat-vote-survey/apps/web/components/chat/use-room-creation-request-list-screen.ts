"use client";

import { useMemo } from "react";
import { useMyRoomCreationRequestsQuery } from "@/lib/chat/chat-room-queries";
import { createRoomCreationRequestListErrorMessage } from "@/lib/chat/room-creation-request-presentation";

export function useRoomCreationRequestListScreen() {
  const query = useMyRoomCreationRequestsQuery();
  const errorMessage = useMemo(
    () => (query.isError ? createRoomCreationRequestListErrorMessage(query.error) : null),
    [query.error, query.isError],
  );

  return {
    errorMessage,
    hasNextPage: query.hasNextPage ?? false,
    isError: query.isError,
    isFetchingNextPage: query.isFetchingNextPage,
    isPending: query.isPending,
    loadMore: () => void query.fetchNextPage(),
    requests: query.requests,
    retry: () => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()),
  };
}
