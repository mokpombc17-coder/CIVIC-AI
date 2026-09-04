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
import {
  observeAccessTokenRefreshed,
  observeAuthenticationSucceeded,
} from "@/lib/auth/authentication-session-events";
import { ensureAccessToken } from "@/lib/auth/authenticated-fetch";
import { ChatRealtimeDiagnosticsPanel } from "@/components/chat-realtime-diagnostics-panel";
import { attachChatRealtimePageLifecycle } from "@/lib/chat/realtime/chat-realtime-page-lifecycle";
import { attachChatRealtimeRoomLifecycle } from "@/lib/chat/realtime/chat-realtime-room-lifecycle";
import { attachChatAuthenticationRecovery } from "@/lib/chat/realtime/chat-authentication-recovery";
import { createChatRealtimeTransport } from "@/lib/chat/realtime/create-chat-realtime-transport";
import { attachChatRealtimeDiagnosticsDevtools } from "@/lib/chat/realtime/diagnostics/chat-realtime-diagnostics-devtools";
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
import {
  clearChatAuthenticationRequired,
  reportChatAuthenticationRequired,
} from "@/lib/chat/chat-authentication-required";
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
    const handleAuthenticationSucceeded = () => {
      clearChatAuthenticationRequired();
      transport.reconnect("authentication-succeeded");
    };
    const handleAccessTokenRefreshed = () => {
      clearChatAuthenticationRequired();

      if (transport.getSnapshot().status !== "authentication-required") {
        transport.reconnect("authentication-succeeded");
      }
    };
    const detachOutbox = outbox.attach();
    const detachRealtime = attachChatRealtimePageLifecycle(transport, window);
    const detachDiagnostics = attachChatRealtimeDiagnosticsDevtools(transport, window);
    const detachAuthentication = observeAuthenticationSucceeded(
      window,
      handleAuthenticationSucceeded,
    );
    const detachAccessTokenRefresh = observeAccessTokenRefreshed(
      window,
      handleAccessTokenRefreshed,
    );
    const detachAuthenticationRecovery = attachChatAuthenticationRecovery(transport, {
      ensureAccessToken,
      onAuthenticationRecovered: clearChatAuthenticationRequired,
      onAuthenticationRequired: () => {
        reportChatAuthenticationRequired({ status: 401 });
      },
    });

    return () => {
      detachAuthenticationRecovery();
      detachAccessTokenRefresh();
      detachAuthentication();
      detachDiagnostics();
      detachRealtime();
      detachOutbox();
    };
  }, [outbox, transport]);

  return (
    <ChatRealtimeContext value={realtime}>
      {children}
      <ChatRoomInboxRuntime transport={transport} />
      {process.env.NODE_ENV === "development" ? (
        <ChatRealtimeDiagnosticsPanel transport={transport} />
      ) : null}
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

export function useChatRealtimeRoom(
  roomId: string,
  { enabled = true }: Readonly<{ enabled?: boolean }> = {},
): ChatRealtimeRoomState {
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
    if (enabled) {
      transport.claimRoom(roomId);
    }
  }, [enabled, roomId, transport]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    return attachChatRealtimeRoomLifecycle(transport, roomId, window);
  }, [enabled, roomId, transport]);

  return {
    ...roomSnapshot,
    connectionError: connectionSnapshot.error,
    connectionStatus: connectionSnapshot.status,
    isActive:
      enabled &&
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
