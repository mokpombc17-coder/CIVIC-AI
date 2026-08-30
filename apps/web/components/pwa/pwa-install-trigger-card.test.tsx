import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PwaInstallTriggerCard } from "./pwa-install-trigger-card";
import {
  capturePwaInstallPrompt,
  requestPwaInstall,
  type BeforeInstallPromptEvent,
} from "@/lib/pwa/install-prompt";

describe("PwaInstallTriggerCard", () => {
  it("keeps the home welcome card unchanged until the browser offers installation", () => {
    const html = renderToStaticMarkup(
      createElement(PwaInstallTriggerCard, null, createElement("h2", null, "CIVIC.AI")),
    );

    expect(html).toContain('class="wf-card wf-home-welcome wf-pwa-install-trigger"');
    expect(html).toContain('data-pwa-install-trigger="true"');
    expect(html).not.toContain("<button");
  });

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
