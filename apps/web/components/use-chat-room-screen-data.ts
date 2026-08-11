"use client";

import { useCallback, useEffect, useMemo } from "react";
import type { ChatRoomEntryHistoryPageState } from "@/lib/chat/chat-room-entry-history-search";
import type { ChatMessage, RoomMembershipListItem } from "@/lib/chat/chat-room-contracts";
import { ROOM_PARTICIPANT_PROFILE_PAGE_LIMIT } from "@/lib/chat/chat-room-participant-profiles";
import {
  DEFAULT_MESSAGE_HISTORY_LIMIT,
  flattenRoomMessageHistoryPages,
  useRoomMembershipsQuery,
  useRoomMessageHistoryQuery,
} from "@/lib/chat/chat-room-queries";

export function useChatRoomParticipantProfiles(
  roomId: string,
  { enabled }: Readonly<{ enabled: boolean }>,
): readonly RoomMembershipListItem[] {
  const query = useRoomMembershipsQuery(roomId, {
    enabled,
    limit: ROOM_PARTICIPANT_PROFILE_PAGE_LIMIT,
    status: "ACTIVE",
  });
  const { fetchNextPage, hasNextPage, isFetchNextPageError, isFetchingNextPage, memberships } =
    query;

  useEffect(() => {
    if (
      !shouldLoadNextParticipantProfilesPage({
        enabled,
        hasNextPage,
        isFetchNextPageError,
        isFetchingNextPage,
      })
    ) {
      return;
    }

    void fetchNextPage();
  }, [enabled, fetchNextPage, hasNextPage, isFetchNextPageError, isFetchingNextPage]);

  return memberships;
}

export function useChatRoomMessageHistoryData(
  roomId: string,
  { enabled }: Readonly<{ enabled: boolean }>,
) {
  const query = useRoomMessageHistoryQuery(roomId, {
    enabled,
    limit: DEFAULT_MESSAGE_HISTORY_LIMIT,
  });
  const { fetchNextPage, hasNextPage, messages } = query;
  const entryHistory = useMemo(
    () => createChatRoomEntryHistoryPageState(messages, hasNextPage),
    [hasNextPage, messages],
  );
  const loadOlderEntryHistory = useCallback(async () => {
    const result = await fetchNextPage();

    if (result.isError) {
      throw result.error;
    }

    return createChatRoomEntryHistoryPageState(
      flattenRoomMessageHistoryPages(roomId, result.data?.pages),
      result.hasNextPage,
    );
  }, [fetchNextPage, roomId]);

  return {
    ...query,
    entryHistory,
    loadOlderEntryHistory,
  };
}

export function shouldLoadNextParticipantProfilesPage({
  enabled,
  hasNextPage,
  isFetchNextPageError,
  isFetchingNextPage,
}: Readonly<{
  enabled: boolean;
  hasNextPage: boolean;
  isFetchNextPageError: boolean;
  isFetchingNextPage: boolean;
}>): boolean {
  return enabled && hasNextPage && !isFetchingNextPage && !isFetchNextPageError;
}

export function createChatRoomEntryHistoryPageState(
  messages: readonly ChatMessage[],
  hasOlderMessages: boolean,
): ChatRoomEntryHistoryPageState {
  return Object.freeze({
    hasOlderMessages,
    messages,
  });
}
