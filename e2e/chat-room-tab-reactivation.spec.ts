import { expect, test, type Page } from "@playwright/test";
import { authenticateLocalE2EUser, createRoomAndEnter } from "./chat-e2e-helpers";

const ACTIVE_ROOM_LABEL = "채팅 가능";
const TAB_REPLACED_TITLE = "다른 탭에서 채팅 중이에요.";

test("같은 브라우저의 두 탭이 같은 방을 열면 돌아온 탭이 자동으로 사용권을 되찾는다", async ({
  context,
  page: firstPage,
}) => {
  const uniqueId = crypto.randomUUID();
  const roomName = `e2e-tab-room-${uniqueId}`;
  const preservedDraft = `탭 전환 중 보존할 초안 ${uniqueId}`;
  const firstMessageInput = firstPage.getByRole("textbox", { name: "메시지" });

  await test.step("첫 번째 탭이 방을 활성화하고 작성 중인 초안을 가진다", async () => {
    await authenticateLocalE2EUser(firstPage, context, `e2e-tab-${uniqueId}`);
    await createRoomAndEnter(firstPage, roomName);

    await expect(firstPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
    await expect(firstMessageInput).toBeEnabled();
    await firstMessageInput.fill(preservedDraft);
  });

  const secondPage = await context.newPage();
  const secondMessageInput = secondPage.getByRole("textbox", { name: "메시지" });

  try {
    await test.step("두 번째 탭이 같은 방을 열면 첫 번째 탭은 초안을 유지한 채 멈춘다", async () => {
      await secondPage.goto(firstPage.url());

      await expect(secondPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(secondMessageInput).toBeEnabled();
      await expect(getTabReplacedNotice(firstPage)).toContainText(TAB_REPLACED_TITLE);
      await expect(firstMessageInput).toBeDisabled();
      await expect(firstMessageInput).toHaveValue(preservedDraft);
    });

    await test.step("첫 번째 탭으로 돌아오면 버튼 없이 사용권과 초안을 되찾는다", async () => {
      await simulateTabReturn(firstPage);

      await expect(firstPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(getTabReplacedNotice(firstPage)).toHaveCount(0);
      await expect(firstMessageInput).toBeEnabled();
      await expect(firstMessageInput).toHaveValue(preservedDraft);
      await expect(getTabReplacedNotice(secondPage)).toContainText(TAB_REPLACED_TITLE);
      await expect(secondMessageInput).toBeDisabled();
    });

    await test.step("탭 전환이 없는 화면에서는 여기서 계속하기로 사용권을 되찾는다", async () => {
      await getTabReplacedNotice(secondPage)
        .getByRole("button", { name: "여기서 계속하기", exact: true })
        .click();

      await expect(secondPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(secondMessageInput).toBeEnabled();
      await expect(getTabReplacedNotice(firstPage)).toContainText(TAB_REPLACED_TITLE);
      await expect(firstMessageInput).toBeDisabled();
      await expect(firstMessageInput).toHaveValue(preservedDraft);
    });
  } finally {
    await secondPage.close();
  }
});

test("활성 탭이 닫힌 뒤 남은 탭은 돌아왔을 때 자동으로 사용권을 되찾는다", async ({
  context,
  page: firstPage,
}) => {
  const uniqueId = crypto.randomUUID();
  const firstMessageInput = firstPage.getByRole("textbox", { name: "메시지" });

  await authenticateLocalE2EUser(firstPage, context, `e2e-tab-close-${uniqueId}`);
  await createRoomAndEnter(firstPage, `e2e-tab-close-${uniqueId}`);
  await expect(firstPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();

  const secondPage = await context.newPage();

  await test.step("두 번째 탭이 같은 방의 사용권을 가져간다", async () => {
    await secondPage.goto(firstPage.url());

    await expect(secondPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
    await expect(getTabReplacedNotice(firstPage)).toContainText(TAB_REPLACED_TITLE);
    await expect(firstMessageInput).toBeDisabled();
  });

  await test.step("활성 탭이 닫혀도 남은 탭은 돌아오기 전까지 멈춘 상태를 유지한다", async () => {
    await secondPage.close();

    await expect(getTabReplacedNotice(firstPage)).toContainText(TAB_REPLACED_TITLE);
    await expect(firstMessageInput).toBeDisabled();
  });

  await test.step("남은 탭으로 돌아오면 버튼 없이 사용권을 되찾는다", async () => {
    await simulateTabReturn(firstPage);

    await expect(firstPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
    await expect(getTabReplacedNotice(firstPage)).toHaveCount(0);
    await expect(firstMessageInput).toBeEnabled();
  });
});

function getTabReplacedNotice(page: Page) {
  return page.locator('[data-chat-session-notice="replaced"]');
}

// headless 브라우저는 탭을 숨김 상태로 만들지 않으므로 앞으로 가져온 뒤 숨김에서 보임으로 바뀌는 신호를 보냄
async function simulateTabReturn(page: Page): Promise<void> {
  await page.bringToFront();
  await page.evaluate(() => {
    let visibilityState: DocumentVisibilityState = "hidden";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => visibilityState === "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    visibilityState = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
}
