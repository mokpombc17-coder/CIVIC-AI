import { expect, test } from "@playwright/test";
import { authenticateDevUserAs, createRoomAndEnter } from "./chat-e2e-helpers";

test("USER_RATE_LIMITED 메시지를 조용히 자동 재전송하고 단일 메시지로 복구한다", async ({
  context,
  page,
}) => {
  const uniqueId = crypto.randomUUID();
  const subject = `e2e-rate-limit-${uniqueId}`;
  const roomName = `e2e-rate-limit-room-${uniqueId}`;
  const firstMessage = createMaximumCostMessage(`첫 번째 ${uniqueId}`);
  const retriedMessage = createMaximumCostMessage(`자동 재전송 ${uniqueId}`);

  await test.step("고유 사용자로 로그인해 사용자별 token bucket을 격리한다", async () => {
    await authenticateDevUserAs(page, context, subject);
  });

  const roomId = await test.step("실제 REST command로 테스트 방을 만들고 진입한다", () =>
    createRoomAndEnter(page, roomName));
  const messageLog = page.getByRole("log", { name: `${roomId} 메시지` });
  const messageInput = page.getByRole("textbox", { name: "메시지" });
  const composerForm = page.locator('form[data-delivery-status="idle"]');

  await test.step("SharedWorker WebSocket과 방 snapshot 준비를 기다린다", async () => {
    await expect(
      page.getByText("이 탭에서 실시간 채팅을 사용 중입니다.", { exact: true }),
    ).toBeVisible();
    await expect(messageInput).toBeEnabled();
    await expect(composerForm).toBeVisible();
  });

  await test.step("token cost 5 메시지로 사용자 bucket을 소진한다", async () => {
    await messageInput.fill(firstMessage);
    await page.getByRole("button", { name: "전송", exact: true }).click();

    await expect(messageLog.getByText(firstMessage, { exact: true })).toHaveCount(1);
    await expect(messageInput).toBeEnabled();
  });

  await test.step("두 번째 cost 5 메시지가 실제 retry-waiting에 진입한다", async () => {
    await messageInput.fill(retriedMessage);
    await page.getByRole("button", { name: "전송", exact: true }).click();

    await expect(page.locator('form[data-delivery-status="retry-waiting"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "전송 중", exact: true })).toBeDisabled();
    await expect(
      page.getByText("메시지를 너무 빠르게 전송했습니다. 잠시 후 다시 시도해 주세요.", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "같은 메시지 다시 전송", exact: true }),
    ).toHaveCount(0);
  });

  await test.step("jitter 대기 뒤 동일 command가 자동 재전송되어 한 번만 표시된다", async () => {
    await expect(messageLog.getByText(retriedMessage, { exact: true })).toHaveCount(1, {
      timeout: 15_000,
    });
    await expect(page.locator('form[data-delivery-status="idle"]')).toBeVisible();
    await expect(messageInput).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "같은 메시지 다시 전송", exact: true }),
    ).toHaveCount(0);
  });

  await test.step("새로고침 후 REST 이력에도 두 메시지가 중복 없이 복구된다", async () => {
    const historyResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === `/api/v1/rooms/${roomId}/messages`,
    );

    await page.reload();

    const response = await historyResponse;
    expect(response.ok(), `메시지 이력 조회가 성공해야 합니다: ${response.status()}`).toBe(true);
    await expect(messageInput).toBeEnabled();
    await expect(messageLog.getByText(firstMessage, { exact: true })).toHaveCount(1);
    await expect(messageLog.getByText(retriedMessage, { exact: true })).toHaveCount(1);
  });
});

function createMaximumCostMessage(label: string): string {
  return `${label} ${"가".repeat(501)}`;
}
