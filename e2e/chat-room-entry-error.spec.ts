import { expect, test } from "@playwright/test";
import { authenticateLocalE2EUserAs } from "./chat-e2e-helpers";

test("차단된 채팅방 진입은 메시지 화면 대신 목록 복귀 안내를 표시한다", async ({
  context,
  page,
}, testInfo) => {
  const roomId = `e2e-blocked-room-${crypto.randomUUID()}`;
  const roomDetailPath = `/api/v1/rooms/${roomId}`;
  const frontendOrigin = new URL(String(testInfo.project.use.baseURL)).origin;

  await authenticateLocalE2EUserAs(page, context, `e2e-blocked-member-${crypto.randomUUID()}`);
  await page.route(`**${roomDetailPath}`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() !== "GET" || url.pathname !== roomDetailPath) {
      await route.continue();
      return;
    }

    await route.fulfill({
      body: JSON.stringify({
        code: "MEMBERSHIP_BANNED",
        detail: "The membership is banned from this Room.",
        instance: roomDetailPath,
        replayed: false,
        retryable: false,
        status: 403,
        title: "Room access denied",
        type: "urn:hamcheeze:problem:membership-banned",
      }),
      headers: {
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Origin": frontendOrigin,
        "Content-Type": "application/problem+json",
      },
      status: 403,
    });
  });

  await page.goto(`/chat/${roomId}`);

  const alert = page.getByRole("alert").filter({
    has: page.getByRole("heading", { name: "채팅방에 참여할 수 없습니다." }),
  });

  await expect(alert).toBeVisible();
  await expect(alert).toContainText("방장에 의해 채팅방에서 퇴장되었습니다.");
  await expect(alert.getByRole("link", { name: "채팅방 목록" })).toHaveAttribute("href", "/chat");
  await expect(page.getByRole("log", { name: `${roomId} 메시지` })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "메시지" })).toHaveCount(0);
});
