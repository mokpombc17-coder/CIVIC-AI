"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { attachChatRealtimePageLifecycle } from "@/lib/chat/realtime/chat-realtime-page-lifecycle";
import { attachChatRealtimeRoomLifecycle } from "@/lib/chat/realtime/chat-realtime-room-lifecycle";
import { createChatRealtimeTransport } from "@/lib/chat/realtime/create-chat-realtime-transport";
import type {
  ChatConnectionSnapshot,
  ChatRealtimeTransport,
  ChatRoomSessionSnapshot,
} from "@/lib/chat/realtime/chat-realtime-transport";

const ChatRealtimeContext = createContext<ChatRealtimeTransport | null>(null);

export type ChatRealtimeRoomState = ChatRoomSessionSnapshot & {
  isActive: boolean;
  reactivate: () => void;
};

export function ChatRealtimeProvider({ children }: { children: ReactNode }) {
  const [transport] = useState(createChatRealtimeTransport);

  useEffect(() => attachChatRealtimePageLifecycle(transport, window), [transport]);

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

export function useChatRealtimeRoom(roomId: string): ChatRealtimeRoomState {
  const transport = useChatRealtimeTransport();
  const snapshot = useSyncExternalStore(
    transport.observeRoom,
    transport.getRoomSnapshot,
    transport.getRoomSnapshot,
  );
  const reactivate = useCallback(() => {
    transport.claimRoom(roomId);
  }, [roomId, transport]);

  useEffect(() => attachChatRealtimeRoomLifecycle(transport, roomId, window), [roomId, transport]);

  return {
    ...snapshot,
    isActive: snapshot.status === "active" && snapshot.roomId === roomId,
    reactivate,
  };
}

export function useChatRealtimeTransport(): ChatRealtimeTransport {
  const transport = useContext(ChatRealtimeContext);

  if (!transport) {
    throw new Error("채팅 실시간 훅은 ChatRealtimeProvider 안에서 사용해야 합니다.");
  }

  return transport;
}
