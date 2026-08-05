import { expect, test } from "@playwright/test";
import { authenticateDevUser, createRoomAndEnter } from "./chat-e2e-helpers";

const ACTIVE_ROOM_LABEL = "채팅 가능";
const REPLACED_ROOM_LABEL = "다른 탭에서 채팅방을 사용 중입니다.";

test("같은 브라우저의 두 탭이 채팅방을 선점하고 다시 활성화할 수 있다", async ({
  context,
  page: firstPage,
}) => {
  const uniqueId = crypto.randomUUID();
  const roomName = `e2e-tab-room-${uniqueId}`;
  const preservedDraft = `탭 전환 중 보존할 초안 ${uniqueId}`;

  await test.step("첫 번째 탭이 채팅방을 활성화하고 작성 중인 초안을 가진다", async () => {
    await authenticateDevUser(firstPage, context);
    await createRoomAndEnter(firstPage, roomName);

    const firstMessageInput = firstPage.getByRole("textbox", { name: "메시지" });

    await expect(firstPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
    await expect(firstMessageInput).toBeEnabled();
    await firstMessageInput.fill(preservedDraft);
  });

  const roomUrl = firstPage.url();
  const secondPage = await context.newPage();

  try {
    await test.step("두 번째 탭이 같은 방을 선점하면 첫 번째 탭의 입력이 중지된다", async () => {
      await secondPage.goto(roomUrl);

      await expect(secondPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(secondPage.getByRole("textbox", { name: "메시지" })).toBeEnabled();

      const firstReplacedAlert = firstPage
        .getByRole("alert")
        .filter({ hasText: REPLACED_ROOM_LABEL });
      const firstMessageInput = firstPage.getByRole("textbox", { name: "메시지" });

      await expect(firstReplacedAlert).toBeVisible();
      await expect(
        firstReplacedAlert.getByRole("button", { name: "이 탭에서 다시 활성화" }),
      ).toBeVisible();
      await expect(firstMessageInput).toBeDisabled();
      await expect(firstMessageInput).toHaveValue(preservedDraft);
    });

    await test.step("첫 번째 탭이 다시 활성화하면 초안과 입력 권한을 되찾는다", async () => {
      await firstPage.getByRole("button", { name: "이 탭에서 다시 활성화" }).click();

      const firstMessageInput = firstPage.getByRole("textbox", { name: "메시지" });
      const secondMessageInput = secondPage.getByRole("textbox", { name: "메시지" });

      await expect(firstPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(firstMessageInput).toBeEnabled();
      await expect(firstMessageInput).toHaveValue(preservedDraft);

      await expect(secondPage.getByText(REPLACED_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(secondMessageInput).toBeDisabled();
      await expect(secondPage.getByRole("button", { name: "이 탭에서 다시 활성화" })).toBeVisible();
    });
  } finally {
    await secondPage.close();
  }
});

test("활성 탭이 종료된 뒤 남은 탭이 수동으로 채팅방을 다시 활성화할 수 있다", async ({
  context,
  page: firstPage,
}) => {
  const roomName = `e2e-tab-close-${crypto.randomUUID()}`;

  await authenticateDevUser(firstPage, context);
  await createRoomAndEnter(firstPage, roomName);
  await expect(firstPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();

  const roomUrl = firstPage.url();
  const secondPage = await context.newPage();

  try {
    await test.step("두 번째 탭이 채팅방 사용권을 선점한다", async () => {
      await secondPage.goto(roomUrl);

      await expect(secondPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(firstPage.getByText(REPLACED_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(firstPage.getByRole("textbox", { name: "메시지" })).toBeDisabled();
    });

    await test.step("활성 탭이 종료되어도 남은 탭은 자동으로 사용권을 선점하지 않는다", async () => {
      await secondPage.close();

      await expect(firstPage.getByText(REPLACED_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(firstPage.getByRole("button", { name: "이 탭에서 다시 활성화" })).toBeVisible();
      await expect(firstPage.getByRole("textbox", { name: "메시지" })).toBeDisabled();
    });

    await test.step("남은 탭에서 명시적으로 다시 활성화하면 입력 권한을 되찾는다", async () => {
      await firstPage.getByRole("button", { name: "이 탭에서 다시 활성화" }).click();

      await expect(firstPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(firstPage.getByRole("textbox", { name: "메시지" })).toBeEnabled();
      await expect(firstPage.getByText(REPLACED_ROOM_LABEL, { exact: true })).toBeHidden();
    });
  } finally {
    if (!secondPage.isClosed()) {
      await secondPage.close();
    }
  }
});
