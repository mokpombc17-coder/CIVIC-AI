import { describe, expect, it, vi } from "vitest";
import { createAuthenticationLifecycleHandlers } from "./authentication-lifecycle";

describe("authentication lifecycle", () => {
  it("LOGIN과 LOGOUT 메시지만 각각의 인증 경계 동작으로 전달한다", () => {
    const onLogin = vi.fn();
    const onLogout = vi.fn();
    const onBfcacheRestore = vi.fn();
    const { handleMessage } = createAuthenticationLifecycleHandlers({
      onBfcacheRestore,
      onLogin,
      onLogout,
    });

    handleMessage({ data: "LOGIN" });
    handleMessage({ data: "LOGOUT" });
    handleMessage({ data: "UNKNOWN" });
    handleMessage({ data: { type: "LOGIN" } });

    expect(onLogin).toHaveBeenCalledOnce();
    expect(onLogout).toHaveBeenCalledOnce();
    expect(onBfcacheRestore).not.toHaveBeenCalled();
  });

  it("BFCache에서 복원된 pageshow만 reload 경계로 전달한다", () => {
    const onBfcacheRestore = vi.fn();
    const { handlePageShow } = createAuthenticationLifecycleHandlers({
      onBfcacheRestore,
      onLogin: vi.fn(),
      onLogout: vi.fn(),
    });

    handlePageShow({ persisted: false });
    handlePageShow({ persisted: true });

    expect(onBfcacheRestore).toHaveBeenCalledOnce();
  });
});
