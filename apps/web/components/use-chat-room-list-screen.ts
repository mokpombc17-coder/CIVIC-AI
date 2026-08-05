"use client";

import { useMemo, useRef, useState } from "react";
import { usePublicRoomsQuery, useRoomInboxQuery } from "@/lib/chat/chat-room-queries";

export function useChatRoomListScreen() {
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
  const createRoomTriggerRef = useRef<HTMLButtonElement>(null);
  const roomInbox = useRoomInboxQuery();
  const publicRooms = usePublicRoomsQuery();
  const participatingRoomIds = useMemo(
    () => new Set(roomInbox.rooms.map((room) => room.roomId)),
    [roomInbox.rooms],
  );
  const discoverableRooms = useMemo(
    () => publicRooms.rooms.filter((room) => !participatingRoomIds.has(room.roomId)),
    [participatingRoomIds, publicRooms.rooms],
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
    participatingRooms: {
      error: roomInbox.error,
      hasNextPage: roomInbox.hasNextPage,
      isError: roomInbox.isError,
      isFetchingNextPage: roomInbox.isFetchingNextPage,
      isPending: roomInbox.isPending,
      loadMore: () => void roomInbox.fetchNextPage(),
      retry: () => void roomInbox.refetch(),
      rooms: roomInbox.rooms,
    },
    publicRooms: {
      error: publicRooms.error,
      hasNextPage: publicRooms.hasNextPage,
      isError: publicRooms.isError,
      isFetchingNextPage: publicRooms.isFetchingNextPage,
      isPending: publicRooms.isPending,
      loadMore: () => void publicRooms.fetchNextPage(),
      retry: () => void publicRooms.refetch(),
      rooms: discoverableRooms,
    },
    toggleCreateRoomForm,
  };
}
