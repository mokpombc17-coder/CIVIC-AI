import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_CHANNEL_NAME, sendAuthMessage, observeAuthMessages } from "./auth-session-events";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.unstubAllGlobals();
});

describe("shared front/front2 channel", () => {
  function installChannel() {
    const port = {
      onmessage: undefined as ((event: { data: unknown }) => void) | undefined,
      postMessage: vi.fn(),
      close: vi.fn(),
    };
    const constructor = vi.fn(function () {
      return port;
    });
    vi.stubGlobal("window", {});
    vi.stubGlobal("BroadcastChannel", constructor);
    return { port, constructor };
  }

  it.each(["LOGIN", "LOGOUT"] as const)("sends %s without invoking its own receiver", (message) => {
    const { port, constructor } = installChannel();
    const receive = vi.fn();
    cleanups.push(observeAuthMessages(receive));
    sendAuthMessage(message);
    expect(constructor).toHaveBeenCalledWith(AUTH_CHANNEL_NAME);
    expect(port.postMessage.mock.calls).toEqual([[message]]);
    expect(receive).not.toHaveBeenCalled();
  });

  it.each(["LOGIN", "LOGOUT"] as const)("delivers a received %s without echoing it", (message) => {
    const { port } = installChannel();
    const receive = vi.fn();
    cleanups.push(observeAuthMessages(receive));
    port.onmessage?.({ data: { type: "OTHER" } });
    expect(receive).not.toHaveBeenCalled();
    port.onmessage?.({ data: message });
    expect(receive.mock.calls).toEqual([[message]]);
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it("shares the channel and closes it after the final subscriber leaves", () => {
    const { port, constructor } = installChannel();
    const first = observeAuthMessages(vi.fn());
    const second = observeAuthMessages(vi.fn());
    cleanups.push(first, second);
    first();
    expect(port.close).not.toHaveBeenCalled();
    expect(constructor).toHaveBeenCalledOnce();
    second();
    expect(port.close).toHaveBeenCalledOnce();
  });

  it("keeps same-tab behavior when BroadcastChannel is unavailable", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("BroadcastChannel", undefined);
    const receive = vi.fn();
    cleanups.push(observeAuthMessages(receive));
    expect(() => sendAuthMessage("LOGIN")).not.toThrow();
    expect(receive).not.toHaveBeenCalled();
  });

  it("keeps a successful auth operation successful when channel posting fails", () => {
    const { port } = installChannel();
    port.postMessage.mockImplementation(() => {
      throw new Error("closed");
    });
    const receive = vi.fn();
    cleanups.push(observeAuthMessages(receive));
    expect(() => sendAuthMessage("LOGOUT")).not.toThrow();
    expect(receive).not.toHaveBeenCalled();
  });
});
