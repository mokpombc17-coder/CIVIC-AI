import type { Metadata } from "next";
import { ChatRoomListScreen } from "@/components/chat/chat-room-list-screen";
import { parseChatRoomInboxFilter } from "@/components/chat/chat-room-inbox-filter";

export const metadata: Metadata = {
  title: "채팅",
};

type ChatPageProps = Readonly<{
  searchParams: Promise<Readonly<{ filter?: string | readonly string[] | undefined }>>;
}>;

export default async function ChatPage({ searchParams }: ChatPageProps) {
  const { filter } = await searchParams;

  return <ChatRoomListScreen initialParticipatingRoomFilter={parseChatRoomInboxFilter(filter)} />;
}
