import { expect, test, type Page } from "@playwright/test";
import {
  authenticateLocalE2EUser,
  createE2ERoomName,
  createRoomAndEnter,
} from "./chat-e2e-helpers";

const ACTIVE_ROOM_LABEL = "채팅 가능";
const CONNECTED_STATUS_SELECTOR = '[data-chat-connection-status="connected"]';
const REPLACED_STATUS_SELECTOR = '[data-chat-connection-status="replaced"]';
const CONNECTION_REPLACED_TITLE = "현재 채팅을 사용할 수 없습니다.";
const RECONNECT_DELAY_GUARD_MS = 4_000;

test("같은 사용자의 새 브라우저 연결이 기존 연결을 교체하고 수동으로 복구한다", async ({
  browser,
}, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL);
  const firstContext = await browser.newContext({ baseURL });
  const secondContext = await browser.newContext({ baseURL });
  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();
  const uniqueId = crypto.randomUUID();
  const subject = `e2e-connection-replaced-${uniqueId}`;

  try {
    const roomUrl =
      await test.step("첫 번째 브라우저가 방에서 같은 사용자의 활성 WebSocket 연결을 소유한다", async () => {
        await authenticateLocalE2EUser(firstPage, firstContext, subject);
        await createRoomAndEnter(firstPage, createE2ERoomName("conn-repl"));

        await expect(firstPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
        await expect(firstPage.locator(CONNECTED_STATUS_SELECTOR)).toHaveCount(1);

        return firstPage.url();
      });

    await test.step("두 번째 브라우저가 연결되면 첫 번째 방 화면에 교체 안내를 표시한다", async () => {
      await authenticateLocalE2EUser(secondPage, secondContext, subject);
      await secondPage.goto(roomUrl);

      await expect(secondPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(secondPage.locator(CONNECTED_STATUS_SELECTOR)).toHaveCount(1);

      const replacedNotice = getConnectionReplacedNotice(firstPage);
      await expect(replacedNotice).toContainText(CONNECTION_REPLACED_TITLE);
      await expect(
        replacedNotice.getByRole("button", { name: "여기서 계속하기", exact: true }),
      ).toBeVisible();
      await expect(replacedNotice.getByRole("button", { name: "다시 연결" })).toHaveCount(0);
      await expect(firstPage.locator(REPLACED_STATUS_SELECTOR)).toHaveCount(1);
      await expect(firstPage.getByRole("textbox", { name: "메시지" })).toBeDisabled();
    });

    await test.step("기본 재연결 지연이 지나도 교체된 연결은 자동으로 되살아나지 않는다", async () => {
      await firstPage.waitForTimeout(RECONNECT_DELAY_GUARD_MS);

      await expect(getConnectionReplacedNotice(firstPage)).toBeVisible();
      await expect(firstPage.locator(REPLACED_STATUS_SELECTOR)).toHaveCount(1);
      await expect(secondPage.locator(CONNECTED_STATUS_SELECTOR)).toHaveCount(1);
    });

    await test.step("첫 번째 브라우저에서 계속하면 두 번째 브라우저의 연결이 교체된다", async () => {
      await getConnectionReplacedNotice(firstPage)
        .getByRole("button", { name: "여기서 계속하기", exact: true })
        .click();

      await expect(firstPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(firstPage.locator(CONNECTED_STATUS_SELECTOR)).toHaveCount(1);
      await expect(getConnectionReplacedNotice(firstPage)).toHaveCount(0);
      await expect(getConnectionReplacedNotice(secondPage)).toContainText(
        CONNECTION_REPLACED_TITLE,
      );
    });
  } finally {
    await Promise.all([firstContext.close(), secondContext.close()]);
  }
});

function getConnectionReplacedNotice(page: Page) {
  return page.locator('[data-chat-session-notice="connection-replaced"]');
}
