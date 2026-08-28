"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  filterLoadedRoomInboxItems,
  type ChatRoomInboxFilter,
} from "@/components/chat-room-inbox-filter";
import {
  getChatRoomListDetailTriggerId,
  type ChatRoomListDetailController,
  type ChatRoomListDetailSelection,
} from "@/components/chat-room-list-detail";
import { usePublicRoomSearch } from "@/components/use-public-room-search";
import { usePublicRoomsQuery, useRoomInboxQuery } from "@/lib/chat/chat-room-queries";

export function useChatRoomListScreen() {
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
  const [participatingRoomFilter, setParticipatingRoomFilter] =
    useState<ChatRoomInboxFilter>("ALL");
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
    participatingRoomFilter: {
      select: setParticipatingRoomFilter,
      value: participatingRoomFilter,
    },
    participatingRooms: {
      error: roomInbox.error,
      hasNextPage: roomInbox.hasNextPage,
      isError: roomInbox.isError,
      isFetchingNextPage: roomInbox.isFetchingNextPage,
      isPending: roomInbox.isPending,
      loadMore: () => void roomInbox.fetchNextPage(),
      retry: () => void roomInbox.refetch(),
      rooms: filteredParticipatingRooms,
    },
    publicRooms: {
      error: publicRooms.error,
      hasNextPage: publicRooms.hasNextPage,
      isError: publicRooms.isError,
      isFetchingNextPage: publicRooms.isFetchingNextPage,
      isPending: publicRooms.isPending,
      loadMore: () => void publicRooms.fetchNextPage(),
      retry: () =>
        void (publicRooms.isFetchNextPageError
          ? publicRooms.fetchNextPage()
          : publicRooms.refetch()),
      rooms: discoverableRooms,
    },
    publicRoomSearch,
    roomDetail,
    toggleCreateRoomForm,
  };
}
