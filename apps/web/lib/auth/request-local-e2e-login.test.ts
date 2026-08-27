import { describe, expect, it, vi } from "vitest";
import { requestLocalE2ELogin, DEFAULT_LOCAL_E2E_AUTH_SUBJECT } from "./request-local-e2e-login";

describe("requestLocalE2ELogin", () => {
  it("고정된 로컬 사용자로 개발용 session을 생성한다", async () => {
    const request = vi.fn(async () => new Response(null, { status: 204 }));

    await requestLocalE2ELogin(request);

    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith("/api/dev/auth/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: DEFAULT_LOCAL_E2E_AUTH_SUBJECT,
      }),
      credentials: "same-origin",
    });
  });

  it("session 생성이 거절되면 HTTP status를 포함한 오류를 던진다", async () => {
    const request = vi.fn(async () => Response.json(null, { status: 404 }));

    await expect(requestLocalE2ELogin(request)).rejects.toThrow(
      "로컬 E2E 로그인 요청에 실패했습니다. (HTTP 404)",
    );
  });
});
