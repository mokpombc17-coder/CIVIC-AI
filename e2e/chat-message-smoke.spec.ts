import { expect, test, type BrowserContext } from "@playwright/test";
import { authenticateDevUser, createRoomAndEnter } from "./chat-e2e-helpers";

test("임시 로그인부터 메시지 새로고침 복구까지 실제 채팅 흐름을 검증한다", async ({
  context,
  page,
}) => {
  const uniqueId = crypto.randomUUID();
  const roomName = `e2e-room-${uniqueId}`;
  const message = `Playwright 메시지 ${uniqueId}`;

  await test.step("임시 로그인으로 HttpOnly 인증 쿠키를 발급한다", async () => {
    await authenticateDevUser(page, context);
  });

  const roomId = await test.step("실제 REST command로 공개 채팅방을 만들고 방으로 진입한다", () =>
    createRoomAndEnter(page, roomName));
  const messageLog = page.getByRole("log", { name: `${roomId} 메시지` });
  const messageInput = page.getByRole("textbox", { name: "메시지" });

  await test.step("채팅 화면의 전역 헤더에서도 임시 로그인을 다시 갱신할 수 있다", async () => {
    const previousAuthCookie = await readAuthCookieValue(context);
    const sessionResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dev/auth/session",
    );

    await page.getByRole("button", { name: "임시 로그인 갱신", exact: true }).click();

    expect((await sessionResponse).status()).toBe(204);
    await expect(page.getByRole("button", { name: "임시 로그인 다시 갱신" })).toBeEnabled();
    expect(await readAuthCookieValue(context)).not.toBe(previousAuthCookie);
  });

  await test.step("SharedWorker WebSocket 구독과 REST snapshot 준비를 기다린다", async () => {
    await expect(page.getByText("채팅 가능", { exact: true })).toBeVisible();
    await expect(messageInput).toBeEnabled();
  });

  await test.step("STOMP command로 메시지를 보내고 실시간 이벤트 수신을 확인한다", async () => {
    await messageInput.fill(message);
    await page.getByRole("button", { name: "전송", exact: true }).click();

    await expect(messageLog.getByText(message, { exact: true })).toBeVisible();
    await expect(
      messageLog.locator("li[data-delivery-status]").filter({ hasText: message }),
    ).toHaveCount(0);
  });

  await test.step("새로고침 후 REST 메시지 이력으로 같은 메시지가 복구되는지 확인한다", async () => {
    const historyResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === `/api/v1/rooms/${roomId}/messages`,
    );

    await page.reload();

    const response = await historyResponse;
    expect(response.ok(), `메시지 이력 조회가 성공해야 합니다: ${response.status()}`).toBe(true);
    await expect(messageInput).toBeEnabled();
    await expect(messageLog.getByText(message, { exact: true })).toBeVisible();
  });
});

async function readAuthCookieValue(context: BrowserContext): Promise<string> {
  const authCookie = (await context.cookies()).find(
    (cookie) => cookie.name === "civic_ai_access_token",
  );

  expect(authCookie, "임시 로그인 쿠키가 발급되어야 합니다.").toBeDefined();
  return authCookie!.value;
}
