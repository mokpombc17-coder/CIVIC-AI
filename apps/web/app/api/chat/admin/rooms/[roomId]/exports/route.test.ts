import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLATFORM_AUTH_COOKIE_NAME } from "@/lib/server/auth/platform-auth-contract";

const cookieGet = vi.fn();
const proxyChatRoomExport = vi.fn(async () => new Response(null, { status: 204 }));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: cookieGet })),
}));

vi.mock("@/lib/server/chat/chat-room-export-proxy", () => ({
  proxyChatRoomExport,
}));

describe("Room chat Export BFF route", () => {
  beforeEach(() => {
    cookieGet.mockReset();
    proxyChatRoomExport.mockClear();
  });

  it("HttpOnly access token과 동적 roomId를 Export proxy에 전달한다", async () => {
    const request = new Request("https://web.example.test/api/chat/admin/rooms/room-01/exports", {
      method: "POST",
    });
    cookieGet.mockReturnValue({ value: "server-only-token" });
    const { POST } = await import("./route");

    const response = await POST(request, { params: Promise.resolve({ roomId: "room-01" }) });

    expect(response.status).toBe(204);
    expect(cookieGet).toHaveBeenCalledWith(PLATFORM_AUTH_COOKIE_NAME);
    expect(proxyChatRoomExport).toHaveBeenCalledWith({
      accessToken: "server-only-token",
      request,
      roomId: "room-01",
    });
  });

  it("쿠키가 없어도 undefined를 proxy에 전달해 인증 오류를 한 곳에서 처리한다", async () => {
    const request = new Request("https://web.example.test/api/chat/admin/rooms/room-01/exports", {
      method: "POST",
    });
    cookieGet.mockReturnValue(undefined);
    const { POST } = await import("./route");

    await POST(request, { params: Promise.resolve({ roomId: "room-01" }) });

    expect(proxyChatRoomExport).toHaveBeenCalledWith({
      accessToken: undefined,
      request,
      roomId: "room-01",
    });
  });
});
