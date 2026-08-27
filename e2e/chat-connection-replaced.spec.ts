import { expect, test } from "@playwright/test";
import { authenticateLocalE2EUser } from "./chat-e2e-helpers";

const CONNECTED_STATUS_SELECTOR = '[data-chat-connection-status="connected"]';
const CONNECTION_REPLACED_LABEL = "실시간 연결: 다른 환경에서 연결됨";
const CONNECTION_REPLACED_MESSAGE =
  "다른 브라우저, 프로필 또는 기기에서 채팅에 연결하여 이 연결이 종료되었습니다.";
const RECONNECT_DELAY_GUARD_MS = 4_000;

test("같은 사용자의 새 브라우저 연결이 기존 연결을 교체하고 수동으로 복구한다", async ({
  browser,
}, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL);
  const firstContext = await browser.newContext({ baseURL });
  const secondContext = await browser.newContext({ baseURL });
  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();

  try {
    await test.step("첫 번째 브라우저가 같은 사용자의 활성 WebSocket 연결을 소유한다", async () => {
      await authenticateLocalE2EUser(firstPage, firstContext);
      await firstPage.goto("/chat");

      await expect(firstPage.locator(CONNECTED_STATUS_SELECTOR)).toHaveCount(1);
    });

    await test.step("두 번째 브라우저가 연결되면 첫 번째 연결이 4001 상태로 교체된다", async () => {
      await authenticateLocalE2EUser(secondPage, secondContext);
      await secondPage.goto("/chat");

      await expect(secondPage.locator(CONNECTED_STATUS_SELECTOR)).toHaveCount(1);

      const replacedAlert = firstPage
        .getByRole("alert")
        .filter({ hasText: CONNECTION_REPLACED_LABEL });

      await expect(replacedAlert).toContainText(CONNECTION_REPLACED_MESSAGE);
      await expect(replacedAlert.getByRole("button", { name: "다시 연결" })).toHaveCount(0);
    });

    await test.step("기본 재연결 지연이 지나도 교체된 연결은 자동으로 되살아나지 않는다", async () => {
      await firstPage.waitForTimeout(RECONNECT_DELAY_GUARD_MS);

      await expect(firstPage.getByText(CONNECTION_REPLACED_LABEL, { exact: true })).toBeVisible();
      await expect(secondPage.locator(CONNECTED_STATUS_SELECTOR)).toHaveCount(1);
    });

    await test.step("새 연결이 종료된 뒤 첫 번째 브라우저를 새로고침하면 수동으로 복구된다", async () => {
      await secondPage.close();
      await firstPage.reload();

      await expect(firstPage.locator(CONNECTED_STATUS_SELECTOR)).toHaveCount(1);
      await expect(firstPage.getByText(CONNECTION_REPLACED_LABEL, { exact: true })).toHaveCount(0);
    });
  } finally {
    await Promise.all([firstContext.close(), secondContext.close()]);
  }
});
