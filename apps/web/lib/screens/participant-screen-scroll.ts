import type { PlatformShellScroll } from "@/components/platform-shell";

const CHILD_SCROLL_SCREENS = new Set([
  "U-ACCOUNT-001",
  "U-ACCOUNT-002",
  "U-ACCOUNT-004",
  "U-RAG-001",
]);

const VISUAL_VIEWPORT_SCREENS = new Set(["U-ACCOUNT-001", "U-ACCOUNT-002", "U-ACCOUNT-004"]);

export function participantScreenScroll(screenId: string): PlatformShellScroll {
  return CHILD_SCROLL_SCREENS.has(screenId) ? "child" : "self";
}

export function participantScreenUsesVisualViewport(screenId: string): boolean {
  return VISUAL_VIEWPORT_SCREENS.has(screenId);
}
