import { describe, expect, it, vi } from "vitest";
import {
  notifyAccessTokenRefreshed,
  notifyAuthenticationSucceeded,
  observeAccessTokenRefreshed,
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

  it("Access Token 갱신을 구독자에게 전달하고 cleanup 이후에는 전달하지 않는다", () => {
    const target = new EventTarget();
    const listener = vi.fn();
    const cleanup = observeAccessTokenRefreshed(target, listener);

    notifyAccessTokenRefreshed(target);
    expect(listener).toHaveBeenCalledTimes(1);

    cleanup();
    notifyAccessTokenRefreshed(target);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
