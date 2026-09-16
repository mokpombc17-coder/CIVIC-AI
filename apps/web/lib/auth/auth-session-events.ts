"use client";

export const AUTH_CHANNEL_NAME = "civic-ai:auth:v1";
export type AuthSessionMessage = "LOGIN" | "LOGOUT";
type MessageListener = (message: AuthSessionMessage) => void;

const messageListeners = new Set<MessageListener>();
let channel: BroadcastChannel | undefined;

function authChannel(): BroadcastChannel | undefined {
  if (channel || typeof window === "undefined") return channel;
  try {
    channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data !== "LOGIN" && event.data !== "LOGOUT") return;
      for (const listener of messageListeners) listener(event.data);
    };
  } catch {
    // Unsupported browsers keep the existing single-tab authentication flow.
  }
  return channel;
}

/** Send only after a successful session change, never for ordinary token refresh. */
export function sendAuthMessage(message: AuthSessionMessage): void {
  try {
    authChannel()?.postMessage(message);
  } catch {
    // A channel failure must not turn a successful login/logout into an error.
  }
}

/** Subscribe to messages received from other BroadcastChannel objects. */
export function observeAuthMessages(listener: MessageListener): () => void {
  messageListeners.add(listener);
  authChannel();
  return () => {
    messageListeners.delete(listener);
    if (messageListeners.size === 0) {
      channel?.close();
      channel = undefined;
    }
  };
}
