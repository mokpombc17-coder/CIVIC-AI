import { describe, expect, it, vi } from "vitest";
import {
  capturePwaInstallPrompt,
  isIosPwaInstallTarget,
  requestPwaInstall,
  type BeforeInstallPromptEvent,
} from "./install-prompt";

describe("PWA install prompt", () => {
  it("suppresses the automatic promotion when capturing the browser prompt", () => {
    const preventDefault = vi.fn();
    const event = { preventDefault } as unknown as Event;

    expect(capturePwaInstallPrompt(event)).toBe(event);
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("opens the captured native prompt and returns the browser choice", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const choice = { outcome: "accepted" as const, platform: "web" };
    const event = {
      prompt,
      userChoice: Promise.resolve(choice),
    } as unknown as BeforeInstallPromptEvent;

    await expect(requestPwaInstall(event)).resolves.toEqual(choice);
    expect(prompt).toHaveBeenCalledOnce();
  });

  it("recognizes iPhone and classic iPad user agents", () => {
    expect(
      isIosPwaInstallTarget({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
      }),
    ).toBe(true);
    expect(
      isIosPwaInstallTarget({
        userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
      }),
    ).toBe(true);
  });

  it("recognizes iPad desktop mode without treating a Mac as iOS", () => {
    expect(
      isIosPwaInstallTarget({
        maxTouchPoints: 5,
        platform: "MacIntel",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
      }),
    ).toBe(true);
    expect(
      isIosPwaInstallTarget({
        maxTouchPoints: 0,
        platform: "MacIntel",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
      }),
    ).toBe(false);
  });

  it("does not offer the iOS guide to Android devices", () => {
    expect(
      isIosPwaInstallTarget({
        maxTouchPoints: 5,
        platform: "Linux armv8l",
        userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9)",
      }),
    ).toBe(false);
  });
});
