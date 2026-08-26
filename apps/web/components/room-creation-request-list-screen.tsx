"use client";

import { RoomCreationRequestListView } from "@/components/room-creation-request-list-view";
import { useRoomCreationRequestListScreen } from "@/components/use-room-creation-request-list-screen";

export function RoomCreationRequestListScreen() {
  const view = useRoomCreationRequestListScreen();
  return <RoomCreationRequestListView {...view} />;
}
