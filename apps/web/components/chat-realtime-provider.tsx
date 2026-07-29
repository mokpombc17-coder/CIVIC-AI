"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createChatRealtimeTransport } from "@/lib/chat/realtime/create-chat-realtime-transport";
import type {
  ChatConnectionSnapshot,
  ChatRealtimeTransport,
} from "@/lib/chat/realtime/chat-realtime-transport";

const ChatRealtimeContext = createContext<ChatRealtimeTransport | null>(null);

export function ChatRealtimeProvider({ children }: { children: ReactNode }) {
  const [transport] = useState(createChatRealtimeTransport);

  useEffect(() => transport.attach(), [transport]);

  return <ChatRealtimeContext value={transport}>{children}</ChatRealtimeContext>;
}

export function useChatRealtimeConnection(): ChatConnectionSnapshot & {
  reconnect: () => void;
} {
  const transport = useChatRealtimeTransport();
  const snapshot = useSyncExternalStore(
    transport.observe,
    transport.getSnapshot,
    transport.getSnapshot,
  );

  return {
    ...snapshot,
    reconnect: transport.reconnect,
  };
}

export function useChatRealtimeTransport(): ChatRealtimeTransport {
  const transport = useContext(ChatRealtimeContext);

  if (!transport) {
    throw new Error("채팅 실시간 훅은 ChatRealtimeProvider 안에서 사용해야 합니다.");
  }

  return transport;
}
