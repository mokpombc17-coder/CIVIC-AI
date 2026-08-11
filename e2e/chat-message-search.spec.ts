import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  authenticateDevUserAs,
  createRoomAndEnter,
  joinPublicRoomAndEnter,
} from "./chat-e2e-helpers";

const ACTIVE_ROOM_LABEL = "채팅 가능";

test("메시지를 검색해 Context로 이동하고 실시간 수정·삭제를 반영한다", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const roomName = `e2e-message-search-${uniqueId}`;
  const searchQuery = `검색표적-${uniqueId.slice(0, 8)}`;
  const beforeMessage = `검색 이전 대화 ${uniqueId}`;
  const targetMessage = `${searchQuery} 원문`;
  const editedMessage = `${searchQuery} 수정됨`;
  const afterMessage = `검색 이후 대화 ${uniqueId}`;
  const ownerContext = await browser.newContext({ baseURL });
  const memberContext = await browser.newContext({ baseURL });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();

  try {
    await Promise.all([
      authenticateDevUserAs(ownerPage, ownerContext, `e2e-search-owner-${uniqueId}`),
      authenticateDevUserAs(memberPage, memberContext, `e2e-search-member-${uniqueId}`),
    ]);

    const roomId = await createRoomAndEnter(ownerPage, roomName);
    await expect(ownerPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
    await joinPublicRoomAndEnter(memberPage, roomId, roomName);
    await expect(memberPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
    const ownerMessageLog = ownerPage.getByRole("log", { name: `${roomId} 메시지` });
    const memberMessageLog = memberPage.getByRole("log", { name: `${roomId} 메시지` });

    await sendAndConfirm(memberPage, memberMessageLog, ownerMessageLog, beforeMessage);
    await sendAndConfirm(memberPage, memberMessageLog, ownerMessageLog, targetMessage);
    await sendAndConfirm(memberPage, memberMessageLog, ownerMessageLog, afterMessage);

    await ownerPage.getByRole("button", { name: "메시지 검색", exact: true }).click();
    const searchDialog = ownerPage.getByRole("dialog", { name: "메시지 검색" });
    const searchResponse = ownerPage.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "POST" &&
        url.pathname === `/api/v1/rooms/${roomId}/messages/search`
      );
    });
    await searchDialog
      .getByRole("search")
      .getByRole("searchbox", { name: "메시지 내용" })
      .fill(searchQuery);
    await searchDialog.getByRole("button", { name: "검색", exact: true }).click();
    expect((await searchResponse).ok(), "메시지 검색 요청이 성공해야 합니다.").toBe(true);

    const searchResult = searchDialog.locator("li:has([data-message-id])").filter({
      hasText: targetMessage,
    });
    await expect(searchResult).toBeVisible();
    await expect(searchResult).toContainText("참여자 2");

    const contextResponse = ownerPage.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname.startsWith(`/api/v1/rooms/${roomId}/messages/`) &&
        url.pathname.endsWith("/context")
      );
    });
    await searchResult.getByRole("button").click();
    expect((await contextResponse).ok(), "메시지 Context 요청이 성공해야 합니다.").toBe(true);

    const targetContextRow = searchDialog.locator('li[data-context-target="true"]');
    await expect(targetContextRow).toContainText(targetMessage);
    await expect(searchDialog.getByText(beforeMessage, { exact: true })).toBeVisible();
    await expect(searchDialog.getByText(afterMessage, { exact: true })).toBeVisible();

    await editMessage(memberPage, memberMessageLog, targetMessage, editedMessage);
    await expect(targetContextRow).toContainText(editedMessage);
    await expect(targetContextRow).not.toContainText(targetMessage);

    await deleteMessage(memberPage, memberMessageLog, editedMessage);
    await expect(targetContextRow.getByText("삭제된 메시지입니다.", { exact: true })).toBeVisible();

    await searchDialog.getByRole("button", { name: "검색 결과로 돌아가기" }).click();
    await expect(searchDialog.getByText("검색 결과가 없습니다.", { exact: true })).toBeVisible();
    await expect(searchDialog.getByText(targetMessage, { exact: true })).toHaveCount(0);
    await expect(searchDialog.getByText(editedMessage, { exact: true })).toHaveCount(0);
  } finally {
    await Promise.all([ownerContext.close(), memberContext.close()]);
  }
});

async function sendAndConfirm(
  senderPage: Page,
  senderLog: Locator,
  receiverLog: Locator,
  content: string,
): Promise<void> {
  await senderPage.getByRole("textbox", { name: "메시지" }).fill(content);
  await senderPage.getByRole("button", { name: "전송", exact: true }).click();
  await expect(senderLog.getByText(content, { exact: true })).toBeVisible();
  await expect(receiverLog.getByText(content, { exact: true })).toBeVisible();
}

async function editMessage(
  page: Page,
  messageLog: Locator,
  currentContent: string,
  nextContent: string,
): Promise<void> {
  await messageLog.getByRole("button", { name: currentContent, exact: true }).click();
  const actions = page.getByRole("dialog", { name: "메시지 작업" });
  await actions.getByRole("button", { name: "수정", exact: true }).click();
  await actions.getByRole("textbox", { name: "메시지 수정" }).fill(nextContent);
  await actions.getByRole("button", { name: "저장", exact: true }).click();
  await expect(actions).toHaveCount(0);
  await expect(messageLog.getByText(nextContent, { exact: true })).toBeVisible();
}

async function deleteMessage(page: Page, messageLog: Locator, content: string): Promise<void> {
  await messageLog.getByRole("button", { name: content, exact: true }).click();
  const actions = page.getByRole("dialog", { name: "메시지 작업" });
  await actions.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(actions.getByText("이 메시지를 삭제할까요?", { exact: true })).toBeVisible();
  await actions.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(actions).toHaveCount(0);
}
