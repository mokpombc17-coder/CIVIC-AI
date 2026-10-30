"use client";

import { ChatRoomListView } from "@/components/chat/chat-room-list-view";
import type { ChatRoomInboxFilter } from "@/components/chat/chat-room-inbox-filter";
import { useChatRoomListScreen } from "@/components/chat/use-chat-room-list-screen";

export function ChatRoomListScreen({
  initialParticipatingRoomFilter = "ALL",
}: {
  initialParticipatingRoomFilter?: ChatRoomInboxFilter;
}) {
  const state = useChatRoomListScreen(initialParticipatingRoomFilter);

  return <ChatRoomListView {...state} />;
}
