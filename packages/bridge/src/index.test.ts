import { describe, expect, it } from "vitest";
import {
  BRIDGE_VERSION,
  parseNativeToWebMessage,
  parseWebToNativeMessage,
  serializeBridgeMessage,
  type NativeToWebMessage,
  type WebToNativeMessage,
} from "./index";

const envelope = {
  version: BRIDGE_VERSION,
  id: "test-message",
  sentAt: 1,
} as const;

describe("bridge protocol", () => {
  it.each<WebToNativeMessage>([
    {
      ...envelope,
      type: "START_OAUTH",
      payload: {
        url: "https://app.example.com/api/auth/mobile/start",
        callbackUrl: "nextwebview://auth/callback",
      },
    },
    {
      ...envelope,
      type: "DOWNLOAD_FILE",
      payload: {
        url: "https://app.example.com/invoices/1.pdf",
        fileName: "invoice.pdf",
      },
    },
    {
      ...envelope,
      type: "REQUEST_PUSH_PERMISSION",
      payload: {},
    },
  ])("accepts the $type web request", (message) => {
    expect(parseWebToNativeMessage(serializeBridgeMessage(message))).toEqual(message);
  });

  it.each<NativeToWebMessage>([
    {
      ...envelope,
      type: "AUTH_RESULT",
      payload: {
        callbackUrl: "nextwebview://auth/callback?code=one-time",
      },
    },
    {
      ...envelope,
      type: "PUSH_REGISTRATION_RESULT",
      payload: {
        status: "granted",
        expoPushToken: "ExponentPushToken[example]",
      },
    },
  ])("accepts the $type native response", (message) => {
    expect(parseNativeToWebMessage(serializeBridgeMessage(message))).toEqual(message);
  });

  it("rejects unsupported bridge versions", () => {
    expect(
      parseWebToNativeMessage(
        JSON.stringify({
          ...envelope,
          version: BRIDGE_VERSION - 1,
          type: "WEB_READY",
          payload: {},
        }),
      ),
    ).toBeNull();
  });

  it("rejects malformed download requests", () => {
    expect(
      parseWebToNativeMessage(
        JSON.stringify({
          ...envelope,
          type: "DOWNLOAD_FILE",
          payload: { url: "javascript:alert(1)" },
        }),
      ),
    ).toBeNull();
  });
});
