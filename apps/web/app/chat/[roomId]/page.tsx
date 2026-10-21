import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatRoomScreen } from "@/components/chat/chat-room-screen";
import { roomIdSchema } from "@/lib/chat/chat-room-contracts";

type ChatRoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export const metadata: Metadata = {
  title: "토론방",
};

export default async function ChatRoomPage({ params }: ChatRoomPageProps) {
  const { roomId } = await params;
  const parsedRoomId = roomIdSchema.safeParse(roomId);

  if (!parsedRoomId.success) {
    notFound();
  }

  return <ChatRoomScreen roomId={parsedRoomId.data} />;
}
