"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { attachChatRealtimePageLifecycle } from "@/lib/chat/realtime/chat-realtime-page-lifecycle";
import { attachChatRealtimeRoomLifecycle } from "@/lib/chat/realtime/chat-realtime-room-lifecycle";
import { createChatRealtimeTransport } from "@/lib/chat/realtime/create-chat-realtime-transport";
import {
  ChatMessageOutbox,
  type ChatOutgoingMessage,
} from "@/lib/chat/realtime/chat-message-outbox";
import type {
  ChatConnectionSnapshot,
  ChatConnectionStatus,
  ChatRealtimeError,
  ChatRealtimeTransport,
  ChatRoomSessionSnapshot,
} from "@/lib/chat/realtime/chat-realtime-transport";
import { ChatRoomInboxRuntime } from "@/components/chat-room-inbox-runtime";

type ChatRealtimeContextValue = Readonly<{
  outbox: ChatMessageOutbox;
  transport: ChatRealtimeTransport;
}>;

const ChatRealtimeContext = createContext<ChatRealtimeContextValue | null>(null);

export type ChatRealtimeRoomState = ChatRoomSessionSnapshot & {
  connectionError: ChatRealtimeError | null;
  connectionStatus: ChatConnectionStatus;
  isActive: boolean;
  reactivate: () => void;
};

export function ChatRealtimeProvider({ children }: { children: ReactNode }) {
  const [realtime] = useState(() => {
    const transport = createChatRealtimeTransport();
    return {
      outbox: new ChatMessageOutbox(transport),
      transport,
    };
  });
  const { outbox, transport } = realtime;

  useEffect(() => {
    const detachOutbox = outbox.attach();
    const detachRealtime = attachChatRealtimePageLifecycle(transport, window);

    return () => {
      detachRealtime();
      detachOutbox();
    };
  }, [outbox, transport]);

  return (
    <ChatRealtimeContext value={realtime}>
      {children}
      <ChatRoomInboxRuntime transport={transport} />
    </ChatRealtimeContext>
  );
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
  const connectionSnapshot = useSyncExternalStore(
    transport.observe,
    transport.getSnapshot,
    transport.getSnapshot,
  );
  const roomSnapshot = useSyncExternalStore(
    transport.observeRoom,
    transport.getRoomSnapshot,
    transport.getRoomSnapshot,
  );
  const reactivate = useCallback(() => {
    transport.claimRoom(roomId);
  }, [roomId, transport]);

  useEffect(() => attachChatRealtimeRoomLifecycle(transport, roomId, window), [roomId, transport]);

  return {
    ...roomSnapshot,
    connectionError: connectionSnapshot.error,
    connectionStatus: connectionSnapshot.status,
    isActive:
      connectionSnapshot.status === "connected" &&
      roomSnapshot.status === "active" &&
      roomSnapshot.roomId === roomId,
    reactivate,
  };
}

export function useChatRealtimeTransport(): ChatRealtimeTransport {
  const realtime = useContext(ChatRealtimeContext);

  if (!realtime) {
    throw new Error("채팅 실시간 훅은 ChatRealtimeProvider 안에서 사용해야 합니다.");
  }

  return realtime.transport;
}

export function useChatMessageOutbox(): ChatMessageOutbox {
  const realtime = useContext(ChatRealtimeContext);

  if (!realtime) {
    throw new Error("채팅 메시지 outbox 훅은 ChatRealtimeProvider 안에서 사용해야 합니다.");
  }

  return realtime.outbox;
}

export function useChatOutgoingMessages(roomId: string): readonly ChatOutgoingMessage[] {
  const outbox = useChatMessageOutbox();
  const messages = useSyncExternalStore(outbox.observe, outbox.getSnapshot, outbox.getSnapshot);

  return useMemo(() => messages.filter((message) => message.roomId === roomId), [messages, roomId]);
}
