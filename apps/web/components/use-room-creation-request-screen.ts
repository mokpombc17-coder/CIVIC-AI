"use client";

import { useMemo } from "react";
import { useMyRoomCreationRequestQuery } from "@/lib/chat/chat-room-queries";
import { createRoomCreationRequestErrorPresentation } from "@/lib/chat/room-creation-request-presentation";

export function useRoomCreationRequestScreen(creationRequestId: string) {
  const query = useMyRoomCreationRequestQuery(creationRequestId);
  const errorPresentation = useMemo(
    () => (query.isError ? createRoomCreationRequestErrorPresentation(query.error) : null),
    [query.error, query.isError],
  );

  return {
    error: errorPresentation,
    isPending: query.isPending,
    isRefreshing: query.isFetching && !query.isPending,
    refresh: () => void query.refetch(),
    request: query.data ?? null,
  };
}
