import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  authenticateDevUserAs,
  createRoomAndEnter,
  joinPublicRoomAndEnter,
} from "./chat-e2e-helpers";

const ACTIVE_ROOM_LABEL = "채팅 가능";

test("작성자 메시지를 수정·삭제하고 두 사용자가 현재 snapshot을 복구한다", async ({
  browser,
}, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const roomName = `e2e-message-mutation-${uniqueId}`;
  const ownerSubject = `e2e-mutation-owner-${uniqueId}`;
  const memberSubject = `e2e-mutation-member-${uniqueId}`;
  const originalMessage = `수정 전 메시지 ${uniqueId}`;
  const editedMessage = `수정 후 메시지 ${uniqueId}`;
  const ownerContext = await browser.newContext({ baseURL });
  const memberContext = await browser.newContext({ baseURL });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();

  try {
    await test.step("서로 다른 사용자로 로그인하고 같은 공개 방에 참여한다", async () => {
      await authenticateDevUserAs(ownerPage, ownerContext, ownerSubject);
      await authenticateDevUserAs(memberPage, memberContext, memberSubject);
    });

    const roomId =
      await test.step("방장이 방을 만들고 참여자의 실시간 구독까지 준비한다", async () => {
        const createdRoomId = await createRoomAndEnter(ownerPage, roomName);

        await expect(ownerPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
        await joinPublicRoomAndEnter(memberPage, createdRoomId, roomName);
        await expect(memberPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
        await expect(memberPage.getByRole("textbox", { name: "메시지" })).toBeEnabled();

        return createdRoomId;
      });
    const ownerMessageLog = ownerPage.getByRole("log", { name: `${roomId} 메시지` });
    const memberMessageLog = memberPage.getByRole("log", { name: `${roomId} 메시지` });

    const clientMessageId =
      await test.step("작성자가 메시지를 보내고 두 사용자에게 확정 snapshot이 표시된다", async () => {
        await sendMessage(ownerPage, originalMessage);
        await expectConfirmedMessage(ownerMessageLog, originalMessage);
        await expect(memberMessageLog.getByText(originalMessage, { exact: true })).toBeVisible();

        const messageRow = ownerMessageLog.locator("li").filter({ hasText: originalMessage });
        const id = await messageRow.getAttribute("data-client-message-id");

        expect(id, "확정 메시지 행은 clientMessageId를 유지해야 합니다.").not.toBeNull();
        await expect(
          memberMessageLog.getByRole("button", {
            name: originalMessage,
            exact: true,
          }),
        ).toHaveCount(0);

        return id!;
      });

    await test.step("공용 Bottom Sheet를 닫아도 composer draft와 trigger focus를 보존한다", async () => {
      const messageInput = ownerPage.locator('textarea[enterkeyhint="send"]');
      const actionTrigger = ownerMessageLog.getByRole("button", {
        name: originalMessage,
        exact: true,
      });
      const draftMessage = `작성 중 draft ${uniqueId}`;

      await messageInput.fill(draftMessage);
      await actionTrigger.click();

      const mutationDialog = ownerPage.getByRole("dialog", { name: "메시지 작업" });
      const messageActionsSheet = ownerPage.locator('[data-chat-message-actions-sheet="true"]');
      await expect(messageActionsSheet).toHaveCount(1);
      await expect(messageInput).toHaveValue(draftMessage);

      const [chatRoomBounds, composerBounds, sheetBounds] = await Promise.all([
        ownerPage.locator('[data-chat-room-view="true"]').boundingBox(),
        ownerPage.locator('form:has(textarea[enterkeyhint="send"])').boundingBox(),
        messageActionsSheet.boundingBox(),
      ]);

      if (!chatRoomBounds || !composerBounds || !sheetBounds) {
        throw new Error("채팅방, composer와 Bottom Sheet의 화면 위치를 확인할 수 없습니다.");
      }

      expect(
        Math.abs(sheetBounds.y + sheetBounds.height - (chatRoomBounds.y + chatRoomBounds.height)),
      ).toBeLessThanOrEqual(2);
      expect(sheetBounds.y).toBeLessThanOrEqual(composerBounds.y);

      await mutationDialog.getByRole("button", { name: "메시지 작업 닫기" }).click();

      await expect(mutationDialog).toHaveCount(0);
      await expect(actionTrigger).toBeFocused();
      await expect(messageInput).toHaveValue(draftMessage);
      await messageInput.fill("");
    });

    await test.step("작성자가 공용 Bottom Sheet에서 메시지를 수정하면 양쪽 화면에 반영된다", async () => {
      await ownerMessageLog
        .getByRole("button", {
          name: originalMessage,
          exact: true,
        })
        .click();

      const mutationDialog = ownerPage.getByRole("dialog", { name: "메시지 작업" });
      await expect(ownerPage.locator('[data-chat-message-actions-sheet="true"]')).toHaveCount(1);
      await expect(mutationDialog).toBeVisible();
      await mutationDialog.getByRole("button", { name: "수정", exact: true }).click();
      await mutationDialog
        .getByRole("textbox", { name: "메시지 수정" })
        .fill(`  ${editedMessage}  `);
      await mutationDialog.getByRole("button", { name: "저장", exact: true }).click();

      await expect(mutationDialog).toHaveCount(0);
      await expect(ownerMessageLog.getByText(editedMessage, { exact: true })).toBeVisible();
      await expect(memberMessageLog.getByText(editedMessage, { exact: true })).toBeVisible();
      await expect(ownerMessageLog.getByText(originalMessage, { exact: true })).toHaveCount(0);
      await expect(memberMessageLog.getByText(originalMessage, { exact: true })).toHaveCount(0);

      const editedRow = ownerMessageLog.locator(`li[data-client-message-id="${clientMessageId}"]`);
      await expect(editedRow.getByText("(수정됨)", { exact: true })).toBeVisible();
      await expect(
        memberMessageLog.getByRole("button", {
          name: editedMessage,
          exact: true,
        }),
      ).toHaveCount(0);
    });

    await test.step("동일 내용 수정은 room event 없이 command result로 pending을 종료한다", async () => {
      await ownerMessageLog
        .getByRole("button", {
          name: editedMessage,
          exact: true,
        })
        .click();

      const mutationDialog = ownerPage.getByRole("dialog", { name: "메시지 작업" });
      await mutationDialog.getByRole("button", { name: "수정", exact: true }).click();
      await expect(mutationDialog.getByRole("textbox", { name: "메시지 수정" })).toHaveValue(
        editedMessage,
      );
      await mutationDialog.getByRole("button", { name: "저장", exact: true }).click();

      await expect(mutationDialog).toHaveCount(0);
      await expect(ownerMessageLog.getByText(editedMessage, { exact: true })).toHaveCount(1);
      await expect(memberMessageLog.getByText(editedMessage, { exact: true })).toHaveCount(1);
    });

    await test.step("작성자가 삭제하면 기존 행이 양쪽 화면에서 tombstone으로 바뀐다", async () => {
      await ownerMessageLog
        .getByRole("button", {
          name: editedMessage,
          exact: true,
        })
        .click();

      const mutationDialog = ownerPage.getByRole("dialog", { name: "메시지 작업" });
      await mutationDialog.getByRole("button", { name: "삭제", exact: true }).click();
      await expect(
        mutationDialog.getByText("이 메시지를 삭제할까요?", { exact: true }),
      ).toBeVisible();
      await mutationDialog.getByRole("button", { name: "삭제", exact: true }).click();

      await expect(mutationDialog).toHaveCount(0);

      const ownerTombstone = ownerMessageLog.locator(
        `li[data-client-message-id="${clientMessageId}"]`,
      );
      const memberTombstone = memberMessageLog.locator(
        `li[data-client-message-id="${clientMessageId}"]`,
      );
      await expect(ownerTombstone.getByText("삭제된 메시지입니다.", { exact: true })).toBeVisible();
      await expect(
        memberTombstone.getByText("삭제된 메시지입니다.", { exact: true }),
      ).toBeVisible();
      await expect(ownerTombstone.getByRole("button")).toHaveCount(0);
      await expect(memberTombstone.getByRole("button")).toHaveCount(0);
      await expect(ownerMessageLog.getByText(editedMessage, { exact: true })).toHaveCount(0);
      await expect(memberMessageLog.getByText(editedMessage, { exact: true })).toHaveCount(0);
    });

    await test.step("새로고침 후 REST 이력에서도 같은 위치의 tombstone을 복구한다", async () => {
      const ownerHistoryResponse = waitForMessageHistory(ownerPage, roomId);
      const memberHistoryResponse = waitForMessageHistory(memberPage, roomId);

      await Promise.all([ownerPage.reload(), memberPage.reload()]);

      const [ownerResponse, memberResponse] = await Promise.all([
        ownerHistoryResponse,
        memberHistoryResponse,
      ]);
      expect(
        ownerResponse.ok(),
        `방장 메시지 이력 조회가 성공해야 합니다: ${ownerResponse.status()}`,
      ).toBe(true);
      expect(
        memberResponse.ok(),
        `참여자 메시지 이력 조회가 성공해야 합니다: ${memberResponse.status()}`,
      ).toBe(true);

      await expect(ownerPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(memberPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(
        ownerMessageLog
          .locator(`li[data-client-message-id="${clientMessageId}"]`)
          .getByText("삭제된 메시지입니다.", { exact: true }),
      ).toBeVisible();
      await expect(
        memberMessageLog
          .locator(`li[data-client-message-id="${clientMessageId}"]`)
          .getByText("삭제된 메시지입니다.", { exact: true }),
      ).toBeVisible();
    });
  } finally {
    await Promise.all([ownerContext.close(), memberContext.close()]);
  }
});

async function sendMessage(page: Page, content: string): Promise<void> {
  await page.getByRole("textbox", { name: "메시지" }).fill(content);
  await page.getByRole("button", { name: "전송", exact: true }).click();
}

async function expectConfirmedMessage(messageLog: Locator, content: string): Promise<void> {
  await expect(messageLog.getByText(content, { exact: true })).toBeVisible();
  await expect(
    messageLog.locator("li[data-delivery-status]").filter({
      hasText: content,
    }),
  ).toHaveCount(0);
}

function waitForMessageHistory(page: Page, roomId: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === `/api/v1/rooms/${roomId}/messages`,
  );
}
