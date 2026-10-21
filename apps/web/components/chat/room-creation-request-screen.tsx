"use client";

import { RoomCreationRequestView } from "@/components/chat/room-creation-request-view";
import { useRoomCreationRequestScreen } from "@/components/chat/use-room-creation-request-screen";

export function RoomCreationRequestScreen({ creationRequestId }: { creationRequestId: string }) {
  const view = useRoomCreationRequestScreen(creationRequestId);
  return <RoomCreationRequestView {...view} />;
}
