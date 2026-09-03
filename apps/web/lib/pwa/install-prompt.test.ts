import { describe, expect, it, vi } from "vitest";
import {
  capturePwaInstallPrompt,
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
});
