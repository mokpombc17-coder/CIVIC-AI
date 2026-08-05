"use client";

import { ChatRoomListView } from "@/components/chat-room-list-view";
import { useChatRoomListScreen } from "@/components/use-chat-room-list-screen";

export function ChatRoomListScreen() {
  const state = useChatRoomListScreen();

  return <ChatRoomListView {...state} />;
}
