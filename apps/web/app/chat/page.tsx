import type { Metadata } from "next";
import { ChatRoomListScreen } from "@/components/chat-room-list-screen";

export const metadata: Metadata = {
  title: "채팅방",
};

export default function ChatPage() {
  return <ChatRoomListScreen />;
}
