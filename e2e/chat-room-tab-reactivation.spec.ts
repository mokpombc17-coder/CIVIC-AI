import { expect, test } from "@playwright/test";
import { authenticateDevUser, createRoomAndEnter } from "./chat-e2e-helpers";

const ACTIVE_ROOM_LABEL = "이 탭에서 실시간 채팅을 사용 중입니다.";
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
