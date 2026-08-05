import { describe, expect, it, vi } from "vitest";
import {
  notifyAuthenticationSucceeded,
  observeAuthenticationSucceeded,
} from "./authentication-session-events";

describe("authentication session events", () => {
  it("로그인 성공을 구독자에게 전달하고 cleanup 이후에는 전달하지 않는다", () => {
    const target = new EventTarget();
    const listener = vi.fn();
    const cleanup = observeAuthenticationSucceeded(target, listener);

    notifyAuthenticationSucceeded(target);
    expect(listener).toHaveBeenCalledTimes(1);

    cleanup();
    notifyAuthenticationSucceeded(target);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
