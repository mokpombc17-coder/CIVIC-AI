"use client";

import {
  BRIDGE_VERSION,
  NATIVE_TO_WEB_EVENT,
  createBridgeId,
  parseNativeToWebMessage,
  serializeBridgeMessage,
  type NativeToWebMessage,
  type WebToNativeMessage,
} from "@repo/bridge";

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage(message: string): void;
    };
  }
}

export function isNativeShell(): boolean {
  return typeof window !== "undefined" && Boolean(window.ReactNativeWebView);
}

export function announceWebReady(): string | null {
  return postToNative({
    version: BRIDGE_VERSION,
    id: createBridgeId("web"),
    sentAt: Date.now(),
    type: "WEB_READY",
    payload: {},
  });
}

export function requestNativeContext(): string | null {
  return postToNative({
    version: BRIDGE_VERSION,
    id: createBridgeId("web"),
    sentAt: Date.now(),
    type: "GET_NATIVE_CONTEXT",
    payload: {},
  });
}

export function requestNativeShare(payload: {
  title?: string;
  text?: string;
  url?: string;
}): string | null {
  return postToNative({
    version: BRIDGE_VERSION,
    id: createBridgeId("web"),
    sentAt: Date.now(),
    type: "SHARE",
    payload,
  });
}

export function subscribeNativeMessages(
  listener: (message: NativeToWebMessage) => void,
): () => void {
  const handleMessage = (event: Event) => {
    if (!(event instanceof CustomEvent) || typeof event.detail !== "string") {
      return;
    }

    const message = parseNativeToWebMessage(event.detail);
    if (message) {
      listener(message);
    }
  };

  window.addEventListener(NATIVE_TO_WEB_EVENT, handleMessage);
  return () => window.removeEventListener(NATIVE_TO_WEB_EVENT, handleMessage);
}

function postToNative(message: WebToNativeMessage): string | null {
  if (!window.ReactNativeWebView) {
    return null;
  }

  window.ReactNativeWebView.postMessage(serializeBridgeMessage(message));
  return message.id;
}
