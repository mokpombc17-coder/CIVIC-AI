import { expect, test } from "@playwright/test";
import { authenticateDevUserAs, createRoomAndEnter } from "./chat-e2e-helpers";

const ACTIVE_ROOM_LABEL = "이 탭에서 실시간 채팅을 사용 중입니다.";
const CONNECTED_LABEL = "실시간 연결: 연결됨";
const REPLACED_ROOM_LABEL = "다른 탭에서 채팅방을 사용 중입니다.";
const ROOM_SESSION_FAILED_LABEL = "채팅방 실시간 연결을 활성화하지 못했습니다.";
const ROOM_CLOSED_MESSAGE = "채팅방이 종료되어 실시간 연결이 해제되었습니다.";

test("방 종료를 전달받은 활성 탭은 4003 이후 해당 방을 다시 활성화할 수 없다", async ({
  browser,
}, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const roomName = `e2e-room-closed-${uniqueId}`;
  const ownerSubject = `e2e-close-owner-${uniqueId}`;
  const ownerContext = await browser.newContext({ baseURL });
  const commandPage = await ownerContext.newPage();

  try {
    await test.step("방장으로 로그인하고 종료할 공개 방을 만든다", async () => {
      await authenticateDevUserAs(commandPage, ownerContext, ownerSubject);
    });

    const { activePage, roomId } =
      await test.step("두 번째 탭이 방의 실시간 사용권을 선점한다", async () => {
        const createdRoomId = await createRoomAndEnter(commandPage, roomName);

        await expect(commandPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();

        const nextActivePage = await ownerContext.newPage();
        await nextActivePage.goto(commandPage.url());
        await expect(nextActivePage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
        await expect(commandPage.getByText(REPLACED_ROOM_LABEL, { exact: true })).toBeVisible();

        return {
          activePage: nextActivePage,
          roomId: createdRoomId,
        };
      });

    await test.step("비활성 탭에서 방장이 실제 방 종료 Command를 실행한다", async () => {
      commandPage.once("dialog", (dialog) => dialog.accept());
      await commandPage.getByRole("button", { name: "방 정보", exact: true }).click();
      await commandPage.getByRole("button", { name: "방 종료", exact: true }).click();

      await expect(commandPage).toHaveURL(/\/chat$/);
    });

    await test.step("활성 탭은 4003 이후 새 연결에서 종료된 방의 실패 상태를 확인한다", async () => {
      await expect(activePage.getByText(CONNECTED_LABEL, { exact: true })).toBeVisible();
      await expect(activePage.getByText(ROOM_SESSION_FAILED_LABEL, { exact: true })).toBeVisible();
      await expect(activePage.getByText(ROOM_CLOSED_MESSAGE, { exact: true })).toBeVisible();
      await expect(activePage.getByRole("textbox", { name: "메시지" })).toBeDisabled();
      await expect(activePage.getByRole("button", { name: "전송", exact: true })).toBeDisabled();
      await expect(
        activePage.getByRole("button", { name: "이 탭에서 다시 활성화", exact: true }),
      ).toHaveCount(0);
      await expect(activePage).toHaveURL(new RegExp(`/chat/${roomId}$`));
    });
  } finally {
    await ownerContext.close();
  }
});
