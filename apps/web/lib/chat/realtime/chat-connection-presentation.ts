import type { ChatConnectionStatus } from "./chat-realtime-transport";

export type ChatConnectionPresentation = Readonly<{
  label: string;
  tone: "neutral" | "pending" | "positive" | "negative";
  canReconnect: boolean;
}>;

const CHAT_CONNECTION_PRESENTATIONS = {
  idle: {
    label: "연결 대기",
    tone: "neutral",
    canReconnect: false,
  },
  connecting: {
    label: "연결 중",
    tone: "pending",
    canReconnect: false,
  },
  connected: {
    label: "연결됨",
    tone: "positive",
    canReconnect: false,
  },
  reconnecting: {
    label: "재연결 중",
    tone: "pending",
    canReconnect: false,
  },
  disconnecting: {
    label: "연결 종료 중",
    tone: "neutral",
    canReconnect: false,
  },
  disconnected: {
    label: "연결 끊김",
    tone: "negative",
    canReconnect: true,
  },
  error: {
    label: "연결 오류",
    tone: "negative",
    canReconnect: true,
  },
} as const satisfies Record<ChatConnectionStatus, ChatConnectionPresentation>;

export function getChatConnectionPresentation(
  status: ChatConnectionStatus,
): ChatConnectionPresentation {
  return CHAT_CONNECTION_PRESENTATIONS[status];
}
