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

export function requestNativeOAuth(payload: { url: string; callbackUrl: string }): string | null {
  return postToNative({
    version: BRIDGE_VERSION,
    id: createBridgeId("web"),
    sentAt: Date.now(),
    type: "START_OAUTH",
    payload,
  });
}

export function requestNativeDownload(payload: {
  url: string;
  fileName?: string;
  mimeType?: string;
}): string | null {
  return postToNative({
    version: BRIDGE_VERSION,
    id: createBridgeId("web"),
    sentAt: Date.now(),
    type: "DOWNLOAD_FILE",
    payload,
  });
}

export function requestPushPermission(): string | null {
  return postToNative({
    version: BRIDGE_VERSION,
    id: createBridgeId("web"),
    sentAt: Date.now(),
    type: "REQUEST_PUSH_PERMISSION",
    payload: {},
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

export function requestNativeResponse(
  send: () => string | null,
  acceptedTypes: readonly NativeToWebMessage["type"][],
  timeoutMs = 120_000,
): Promise<NativeToWebMessage> {
  return new Promise((resolve, reject) => {
    let requestId: string | null = null;
    const unsubscribe = subscribeNativeMessages((message) => {
      if (!requestId || message.id !== requestId) {
        return;
      }

      if (message.type === "BRIDGE_ERROR") {
        cleanup();
        reject(new Error(`${message.payload.code}: ${message.payload.message}`));
        return;
      }

      if (acceptedTypes.includes(message.type)) {
        cleanup();
        resolve(message);
      }
    });

    const timeoutId = window.setTimeout(() => {
      unsubscribe();
      reject(new Error("Native bridge request timed out."));
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      unsubscribe();
    };

    requestId = send();
    if (!requestId) {
      cleanup();
      reject(new Error("Native bridge is unavailable."));
    }
  });
}

function postToNative(message: WebToNativeMessage): string | null {
  if (!window.ReactNativeWebView) {
    return null;
  }

  window.ReactNativeWebView.postMessage(serializeBridgeMessage(message));
  return message.id;
}
