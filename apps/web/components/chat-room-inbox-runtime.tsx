"use client";

import { ChatRoomInboxToastList } from "@/components/chat-room-inbox-toast-list";
import { useChatRoomInboxRuntime } from "@/components/use-chat-room-inbox-runtime";
import type { ChatRealtimeTransport } from "@/lib/chat/realtime/chat-realtime-transport";

export { getCachedRoomName } from "@/components/use-chat-room-inbox-runtime";

export function ChatRoomInboxRuntime({ transport }: { transport: ChatRealtimeTransport }) {
  const { selectToast, toasts } = useChatRoomInboxRuntime(transport);

  return <ChatRoomInboxToastList onSelect={selectToast} toasts={toasts} />;
}
