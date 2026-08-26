import { describe, expect, it, vi } from "vitest";
import { fetchCurrentUser, MainAuthUnavailableError } from "./shell-session-client";

describe("Main/Auth current-user client", () => {
  const accessToken = "header.payload.signature";
  const participantId = "00000000-0000-4000-8000-000000000001";
  const ragAdminId = "00000000-0000-4000-8000-000000000002";

  it("Access Token을 /me에만 전달하고 shell용 최소 view를 반환한다", async () => {
    const request = vi.fn(async () =>
      Response.json({
        user_id: participantId,
        role: "PARTICIPANT",
        permissions: [],
        account_state: "ACTIVE",
        must_change_password: false,
      }),
    );

    await expect(
      fetchCurrentUser({
        baseUrl: new URL("http://main-auth:8080"),
        accessToken,
        request,
      }),
    ).resolves.toEqual({
      userId: participantId,
      role: "PARTICIPANT",
      permissions: [],
      accountState: "ACTIVE",
      mustChangePassword: false,
    });

    expect(request).toHaveBeenCalledWith(new URL("http://main-auth:8080/api/v1/auth/me"), {
      cache: "no-store",
      headers: { cookie: `civic_ai_access_token=${accessToken}` },
      redirect: "manual",
    });
  });

  it("인증 거부와 비정상 형식을 인증 성공으로 추정하지 않는다", async () => {
    for (const request of [
      vi.fn(async () => new Response(null, { status: 401 })),
      vi.fn(async () => Response.json({ role: "ADMIN" })),
    ]) {
      await expect(
        fetchCurrentUser({
          baseUrl: new URL("http://main-auth:8080"),
          accessToken,
          request,
        }),
      ).resolves.toBeNull();
    }
  });

  it("429·5xx·네트워크 오류는 로그아웃이 아니라 일시적인 서비스 장애로 보존한다", async () => {
    for (const request of [
      vi.fn(async () => new Response(null, { status: 429 })),
      vi.fn(async () => new Response(null, { status: 503 })),
      vi.fn(async () => {
        throw new Error("network unavailable");
      }),
    ]) {
      await expect(
        fetchCurrentUser({
          baseUrl: new URL("http://main-auth:8080"),
          accessToken,
          request,
        }),
      ).rejects.toBeInstanceOf(MainAuthUnavailableError);
    }
  });

  it("RAG 관리 권한을 독립 역할로 오인하지 않고 보존한다", async () => {
    const request = vi.fn(async () =>
      Response.json({
        user_id: ragAdminId,
        role: "ADMIN",
        permissions: ["RAG_ADMIN"],
        account_state: "ACTIVE",
        must_change_password: false,
      }),
    );

    await expect(
      fetchCurrentUser({
        baseUrl: new URL("http://main-auth:8080"),
        accessToken,
        request,
      }),
    ).resolves.toMatchObject({ role: "ADMIN", permissions: ["RAG_ADMIN"] });
  });
});
