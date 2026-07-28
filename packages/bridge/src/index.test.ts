import { describe, expect, it } from "vitest";
import {
  BRIDGE_VERSION,
  createNativeShellUserAgent,
  parseNativeToWebMessage,
  parseNativeShellUserAgent,
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
        url: "https://app.example.com/files/example.pdf",
        fileName: "example.pdf",
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
    {
      ...envelope,
      type: "APP_STATE_CHANGED",
      payload: {
        state: "active",
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

  it("rejects a future bridge version until an explicit migration is implemented", () => {
    expect(
      parseNativeToWebMessage(
        JSON.stringify({
          ...envelope,
          version: BRIDGE_VERSION + 1,
          type: "NATIVE_READY",
          payload: {
            platform: "android",
            appVersion: "1.2.3",
            buildVersion: "12",
            capabilities: [],
          },
        }),
      ),
    ).toBeNull();
  });

  it("accepts unknown future capabilities within the current bridge version", () => {
    const message = {
      ...envelope,
      type: "NATIVE_CONTEXT",
      payload: {
        platform: "android",
        appVersion: "1.2.3",
        buildVersion: "12",
        capabilities: ["app-state", "open-settings"],
      },
    } as const;

    expect(parseNativeToWebMessage(JSON.stringify(message))).toEqual(message);
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

describe("native shell user agent", () => {
  it("round-trips the native identity", () => {
    const suffix = createNativeShellUserAgent({
      platform: "android",
      appVersion: "1.2.3",
      buildVersion: "12",
    });

    expect(parseNativeShellUserAgent(`Mozilla/5.0 ${suffix}`)).toEqual({
      platform: "android",
      appVersion: "1.2.3",
      buildVersion: "12",
      bridgeVersion: BRIDGE_VERSION,
    });
  });

  it("parses future bridge metadata so the server can still enforce a build update", () => {
    expect(
      parseNativeShellUserAgent("Mozilla/5.0 NextWebViewShell/2.0.0 (ios; build/42; bridge/3)"),
    ).toEqual({
      platform: "ios",
      appVersion: "2.0.0",
      buildVersion: "42",
      bridgeVersion: 3,
    });
  });

  it("ignores ordinary browser user agents", () => {
    expect(parseNativeShellUserAgent("Mozilla/5.0 Safari/605.1.15")).toBeNull();
  });
});
