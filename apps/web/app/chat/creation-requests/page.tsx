import type { Metadata } from "next";
import { RoomCreationRequestListScreen } from "@/components/room-creation-request-list-screen";

export const metadata: Metadata = {
  title: "채팅방 생성 신청 내역",
};

export default function RoomCreationRequestsPage() {
  return <RoomCreationRequestListScreen />;
}
