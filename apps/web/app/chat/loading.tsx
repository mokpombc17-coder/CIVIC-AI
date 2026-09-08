"use client";

import { usePathname } from "next/navigation";
import { ChatRoomListScreen } from "@/components/chat-room-list-screen";
import { ChatRoomScreenLoading } from "@/components/chat-room-screen-loading";

export default function ChatLoading() {
  const pathname = usePathname();

  return isChatRoomPathname(pathname) ? <ChatRoomScreenLoading /> : <ChatRoomListScreen />;
}

export function isChatRoomPathname(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);

  return segments.length === 2 && segments[0] === "chat" && segments[1] !== "creation-requests";
}
