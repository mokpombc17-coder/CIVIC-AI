"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  filterLoadedRoomInboxItems,
  getChatRoomListHref,
  type ChatRoomInboxFilter,
} from "@/components/chat-room-inbox-filter";
import {
  getChatRoomListDetailTriggerId,
  type ChatRoomListDetailController,
  type ChatRoomListDetailSelection,
} from "@/components/chat-room-list-detail";
import { hasReachedChatUserActiveRoomLimit } from "@/components/chat-room-publishing";
import { useFeatureFailureAnalytics } from "@/components/use-feature-failure-analytics";
import { usePublicRoomSearch } from "@/components/use-public-room-search";
import { getFeatureFailureDetails } from "@/lib/analytics/feature-failure-analytics";
import { usePublicRoomsQuery, useRoomInboxQuery } from "@/lib/chat/chat-room-queries";

export function useChatRoomListScreen(initialParticipatingRoomFilter: ChatRoomInboxFilter = "ALL") {
  const router = useRouter();
  const failureAnalytics = useFeatureFailureAnalytics("chat", "room-list");
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
  const participatingRoomFilter = initialParticipatingRoomFilter;
  const [selectedRoomDetail, setSelectedRoomDetail] = useState<ChatRoomListDetailSelection | null>(
    null,
  );
  const createRoomTriggerRef = useRef<HTMLButtonElement>(null);
  const roomDetailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const roomDetailTriggerRoomIdRef = useRef<string | null>(null);
  const publicRoomSearch = usePublicRoomSearch();
  const roomInbox = useRoomInboxQuery();
  const publicRooms = usePublicRoomsQuery({
    ...(publicRoomSearch.appliedQuery === undefined
      ? {}
      : { query: publicRoomSearch.appliedQuery }),
  });
  const participatingRoomIds = useMemo(
    () => new Set(roomInbox.rooms.map((room) => room.roomId)),
    [roomInbox.rooms],
  );
  const discoverableRooms = useMemo(
    () => publicRooms.rooms.filter((room) => !participatingRoomIds.has(room.roomId)),
    [participatingRoomIds, publicRooms.rooms],
  );
  const filteredParticipatingRooms = useMemo(
    () => filterLoadedRoomInboxItems(roomInbox.rooms, participatingRoomFilter),
    [participatingRoomFilter, roomInbox.rooms],
  );

  useEffect(() => {
    if (roomInbox.isError && roomInbox.rooms.length === 0) {
      failureAnalytics.trackFailure({
        ...getFeatureFailureDetails(roomInbox.error, "api", "chat_room_list_load_failed"),
        incidentKey: "participating-room-list-load",
        operation: "screen_load",
        retryCount: Math.max(0, roomInbox.failureCount - 1),
        surface: "room_list_participating",
      });
      return;
    }
    if (roomInbox.isSuccess) failureAnalytics.trackRecovered("participating-room-list-load");
  }, [
    failureAnalytics,
    roomInbox.error,
    roomInbox.failureCount,
    roomInbox.isError,
    roomInbox.isSuccess,
    roomInbox.rooms.length,
  ]);

  useEffect(() => {
    if (publicRooms.isError && publicRooms.rooms.length === 0) {
      failureAnalytics.trackFailure({
        ...getFeatureFailureDetails(publicRooms.error, "api", "chat_public_room_list_load_failed"),
        incidentKey: "public-room-list-load",
        operation: "screen_load",
        retryCount: Math.max(0, publicRooms.failureCount - 1),
        surface: "room_list_public",
      });
      return;
    }
    if (publicRooms.isSuccess) failureAnalytics.trackRecovered("public-room-list-load");
  }, [
    failureAnalytics,
    publicRooms.error,
    publicRooms.failureCount,
    publicRooms.isError,
    publicRooms.isSuccess,
    publicRooms.rooms.length,
  ]);

  const selectParticipatingRoomFilter = useCallback(
    (filter: ChatRoomInboxFilter) => {
      if (filter === participatingRoomFilter) return;

      router.replace(getChatRoomListHref(filter), { scroll: false });
    },
    [participatingRoomFilter, router],
  );

  const closeRoomDetail = useCallback(() => {
    setSelectedRoomDetail(null);
    const previousTrigger = roomDetailTriggerRef.current;
    const triggerRoomId = roomDetailTriggerRoomIdRef.current;

    requestAnimationFrame(() => {
      const trigger = previousTrigger?.isConnected
        ? previousTrigger
        : triggerRoomId === null
          ? null
          : document.getElementById(getChatRoomListDetailTriggerId(triggerRoomId));

      if (trigger instanceof HTMLButtonElement) {
        trigger.focus();
      }
    });
  }, []);

  const openRoomDetail = useCallback(
    (selection: ChatRoomListDetailSelection, trigger: HTMLButtonElement) => {
      roomDetailTriggerRef.current = trigger;
      roomDetailTriggerRoomIdRef.current = selection.room.roomId;
      setSelectedRoomDetail(selection);
    },
    [],
  );

  const roomDetail: ChatRoomListDetailController = {
    close: closeRoomDetail,
    open: openRoomDetail,
    selection: selectedRoomDetail,
  };

  function closeCreateRoomForm() {
    setIsCreateRoomOpen(false);
    createRoomTriggerRef.current?.focus();
  }

  function toggleCreateRoomForm() {
    if (isCreateRoomOpen) {
      closeCreateRoomForm();
      return;
    }

    setIsCreateRoomOpen(true);
  }

  return {
    closeCreateRoomForm,
    createRoomTriggerRef,
    isCreateRoomOpen,
    hasReachedActiveRoomLimit: hasReachedChatUserActiveRoomLimit(roomInbox.rooms.length),
    participatingRoomFilter: {
      select: selectParticipatingRoomFilter,
      value: participatingRoomFilter,
    },
    participatingRooms: {
      error: roomInbox.error,
      hasNextPage: roomInbox.hasNextPage,
      isError: roomInbox.isError,
      isFetchingNextPage: roomInbox.isFetchingNextPage,
      isPending: roomInbox.isPending,
      loadMore: () => void roomInbox.fetchNextPage(),
      retry: () => {
        failureAnalytics.trackRecoveryAttempt("participating-room-list-load", "user_retry");
        void roomInbox.refetch();
      },
      rooms: filteredParticipatingRooms,
    },
    publicRooms: {
      error: publicRooms.error,
      hasNextPage: publicRooms.hasNextPage,
      isError: publicRooms.isError,
      isFetchingNextPage: publicRooms.isFetchingNextPage,
      isPending: publicRooms.isPending,
      loadMore: () => void publicRooms.fetchNextPage(),
      retry: () => {
        failureAnalytics.trackRecoveryAttempt("public-room-list-load", "user_retry");
        void (publicRooms.isFetchNextPageError
          ? publicRooms.fetchNextPage()
          : publicRooms.refetch());
      },
      rooms: discoverableRooms,
    },
    publicRoomSearch,
    roomDetail,
    toggleCreateRoomForm,
  };
}
