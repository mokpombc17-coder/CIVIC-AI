import { expect, test } from "@playwright/test";
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

  await test.step("SharedWorker WebSocket 구독과 REST snapshot 준비를 기다린다", async () => {
    await expect(
      page.getByText("이 탭에서 실시간 채팅을 사용 중입니다.", { exact: true }),
    ).toBeVisible();
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
