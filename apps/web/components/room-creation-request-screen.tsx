"use client";

import { RoomCreationRequestView } from "@/components/room-creation-request-view";
import { useRoomCreationRequestScreen } from "@/components/use-room-creation-request-screen";

export function RoomCreationRequestScreen({ creationRequestId }: { creationRequestId: string }) {
  const view = useRoomCreationRequestScreen(creationRequestId);
  return <RoomCreationRequestView {...view} />;
}
