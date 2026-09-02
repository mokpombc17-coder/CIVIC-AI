import { expect, test } from "@playwright/test";
import { authenticateLocalE2EUserAs, createRoomAndEnter } from "./chat-e2e-helpers";

const ACTIVE_ROOM_LABEL = "채팅 가능";
const REPLACED_ROOM_LABEL = "다른 탭에서 채팅방을 사용 중입니다.";
const CLOSED_ROOM_LABEL = "종료된 채팅방입니다.";

test("종료된 방은 실시간 구독 없이 지난 대화를 읽기 전용으로 표시한다", async ({
  browser,
}, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const roomName = `e2e-room-closed-${uniqueId}`;
  const historicalMessage = `종료 후에도 남아야 하는 메시지 ${uniqueId}`;
  const ownerSubject = `e2e-close-owner-${uniqueId}`;
  const ownerContext = await browser.newContext({ baseURL });
  const commandPage = await ownerContext.newPage();

  try {
    await test.step("방장으로 로그인하고 종료할 공개 방을 만든다", async () => {
      await authenticateLocalE2EUserAs(commandPage, ownerContext, ownerSubject);
    });

    const { activePage, roomId } =
      await test.step("두 번째 탭이 방의 실시간 사용권을 선점한다", async () => {
        const createdRoomId = await createRoomAndEnter(commandPage, roomName);

        await expect(commandPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();

        const nextActivePage = await ownerContext.newPage();
        await nextActivePage.goto(commandPage.url());
        await expect(nextActivePage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
        await expect(commandPage.getByText(REPLACED_ROOM_LABEL, { exact: true })).toBeVisible();
        await nextActivePage.getByRole("textbox", { name: "메시지" }).fill(historicalMessage);
        await nextActivePage.getByRole("button", { name: "전송", exact: true }).click();
        await expect(nextActivePage.getByText(historicalMessage, { exact: true })).toBeVisible();

        return {
          activePage: nextActivePage,
          roomId: createdRoomId,
        };
      });

    await test.step("비활성 탭에서 방장이 실제 방 종료 Command를 실행한다", async () => {
      commandPage.once("dialog", (dialog) => dialog.accept());
      await commandPage.getByRole("button", { name: "채팅방 메뉴", exact: true }).click();
      await commandPage.getByRole("button", { name: "방 종료", exact: true }).click();

      await expect(commandPage).toHaveURL(/\/chat$/);
    });

    await test.step("종료된 방을 다시 열어 지난 대화와 읽기 전용 상태를 확인한다", async () => {
      await activePage.reload();
      await expect(activePage.getByText("종료됨", { exact: true })).toBeVisible();
      await expect(activePage.getByText(CLOSED_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(activePage.getByText(historicalMessage, { exact: true })).toBeVisible();
      await expect(activePage.getByText(/구독을 연결할 수 없습니다/)).toHaveCount(0);
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
