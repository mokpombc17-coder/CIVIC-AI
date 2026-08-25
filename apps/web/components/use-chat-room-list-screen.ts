"use client";

import { useMemo, useRef, useState } from "react";
import {
  filterLoadedRoomInboxItems,
  type ChatRoomInboxFilter,
} from "@/components/chat-room-inbox-filter";
import { usePublicRoomSearch } from "@/components/use-public-room-search";
import { usePublicRoomsQuery, useRoomInboxQuery } from "@/lib/chat/chat-room-queries";

export function useChatRoomListScreen() {
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
  const [participatingRoomFilter, setParticipatingRoomFilter] =
    useState<ChatRoomInboxFilter>("ALL");
  const createRoomTriggerRef = useRef<HTMLButtonElement>(null);
  const publicRoomSearch = usePublicRoomSearch();
  const roomInbox = useRoomInboxQuery();
  const publicRooms = usePublicRoomsQuery({
    ...(publicRoomSearch.appliedQuery === undefined
      ? {}
      : { query: publicRoomSearch.appliedQuery }),
    ...(publicRoomSearch.category === undefined ? {} : { category: publicRoomSearch.category }),
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
    toggleCreateRoomForm,
  };
}
