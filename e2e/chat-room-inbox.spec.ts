import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  authenticateDevUserAs,
  createRoomAndEnter,
  joinPublicRoomAndEnter,
} from "./chat-e2e-helpers";

const ACTIVE_ROOM_LABEL = "채팅 가능";
const CONNECTED_LABEL = "실시간 연결: 연결됨";
const INBOX_TOAST_LABEL = "새 채팅 메시지 알림";

test("개인 inbox 이벤트로 unread를 갱신하고 실제 확인 위치를 읽음 처리한다", async ({
  browser,
}, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const roomName = `e2e-room-inbox-${uniqueId}`;
  const ownerSubject = `e2e-inbox-owner-${uniqueId}`;
  const memberSubject = `e2e-inbox-member-${uniqueId}`;
  const readMessage = `읽음 처리 메시지 ${uniqueId}`;
  const editedMessage = `수정된 inbox 메시지 ${uniqueId}`;
  const deletedMessage = `삭제될 unread 메시지 ${uniqueId}`;
  const ownerContext = await browser.newContext({ baseURL });
  const memberContext = await browser.newContext({ baseURL });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();

  try {
    await test.step("서로 다른 사용자로 로그인하고 같은 공개 방에 참여한다", async () => {
      await authenticateDevUserAs(ownerPage, ownerContext, ownerSubject);
      await authenticateDevUserAs(memberPage, memberContext, memberSubject);
    });

    const roomId = await test.step("방을 만들고 참여자의 개인 inbox 구독을 준비한다", async () => {
      const createdRoomId = await createRoomAndEnter(ownerPage, roomName);

      await expect(ownerPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await joinPublicRoomAndEnter(memberPage, createdRoomId, roomName);
      await expect(memberPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();

      const inboxResponse = waitForRoomInbox(memberPage);
      await memberPage.goto("/chat");
      expect((await inboxResponse).ok(), "초기 Room inbox 조회가 성공해야 합니다.").toBe(true);
      await expect(memberPage.getByText(CONNECTED_LABEL, { exact: true })).toBeVisible();
      await expect(getParticipatingRoomCard(memberPage, roomName)).toBeVisible();

      return createdRoomId;
    });
    const ownerMessageLog = ownerPage.getByRole("log", { name: `${roomId} 메시지` });

    await test.step("다른 방 CREATE 이벤트가 토스트와 unread badge를 갱신한다", async () => {
      await ownerPage.getByRole("textbox", { name: "메시지" }).fill(readMessage);
      await memberPage.bringToFront();
      await expect.poll(() => memberPage.evaluate(() => document.hasFocus())).toBe(true);

      await ownerPage
        .getByRole("button", { name: "전송", exact: true })
        .evaluate((button: HTMLButtonElement) => button.click());

      await expectConfirmedMessage(ownerMessageLog, readMessage);
      const toast = memberPage.locator(`aside[aria-label="${INBOX_TOAST_LABEL}"]`);
      await expect(toast).toBeVisible();
      await expect(toast.getByText(roomName, { exact: true })).toBeVisible();
      await expect(toast).toContainText(`${readMessage.slice(0, 30)}…`);
      await expect(
        getParticipatingRoomCard(memberPage, roomName).getByLabel("읽지 않은 메시지 1개"),
      ).toBeVisible();
      await expect(getParticipatingRoomCard(memberPage, roomName)).toContainText(readMessage);
      await expect(getParticipatingRoomCard(memberPage, roomName).locator("time")).not.toHaveText(
        "",
      );
    });

    await test.step("메시지가 렌더링된 뒤 확정 sequence를 PUT하고 badge를 제거한다", async () => {
      const readStateResponse = memberPage.waitForResponse((response) => {
        const url = new URL(response.url());

        return (
          response.request().method() === "PUT" &&
          url.pathname === `/api/v1/rooms/${roomId}/read-state`
        );
      });

      await getParticipatingRoomCard(memberPage, roomName).click();
      await expect(memberPage.getByRole("log", { name: `${roomId} 메시지` })).toContainText(
        readMessage,
      );

      const response = await readStateResponse;
      expect(response.ok(), `읽음 위치 갱신이 성공해야 합니다: ${response.status()}`).toBe(true);
      const readState = (await response.json()) as {
        readThroughSequence?: unknown;
        roomId?: unknown;
      };
      expect(readState.roomId).toBe(roomId);
      expect(readState.readThroughSequence).toEqual(expect.any(Number));
      expect(Number(readState.readThroughSequence)).toBeGreaterThan(0);

      const inboxResponse = waitForRoomInbox(memberPage);
      await memberPage.goto("/chat");
      expect((await inboxResponse).ok(), "읽음 처리 후 Room inbox 조회가 성공해야 합니다.").toBe(
        true,
      );

      const roomCard = getParticipatingRoomCard(memberPage, roomName);
      await expect(roomCard).toBeVisible();
      await expect(roomCard.getByLabel(/읽지 않은 메시지/)).toHaveCount(0);
      await expect(memberPage.locator(`aside[aria-label="${INBOX_TOAST_LABEL}"]`)).toHaveCount(0, {
        timeout: 10_000,
      });
    });

    await test.step("latest message UPDATE는 토스트 없이 authoritative preview를 갱신한다", async () => {
      await ownerPage.bringToFront();
      await ownerMessageLog.getByRole("button", { name: readMessage, exact: true }).click();
      const mutationDialog = ownerPage.getByRole("dialog", { name: "메시지 작업" });
      await mutationDialog.getByRole("button", { name: "수정", exact: true }).click();
      await mutationDialog.getByRole("textbox", { name: "메시지 수정" }).fill(editedMessage);

      await memberPage.bringToFront();
      await expect.poll(() => memberPage.evaluate(() => document.hasFocus())).toBe(true);
      const inboxResponse = waitForRoomInbox(memberPage);
      await mutationDialog
        .getByRole("button", { name: "저장", exact: true })
        .evaluate((button: HTMLButtonElement) => button.click());

      expect((await inboxResponse).ok(), "수정 후 Room inbox 조회가 성공해야 합니다.").toBe(true);
      const roomCard = getParticipatingRoomCard(memberPage, roomName);
      await expect(roomCard).toContainText(editedMessage);
      await expect(roomCard.getByLabel(/읽지 않은 메시지/)).toHaveCount(0);
      await expect(memberPage.locator(`aside[aria-label="${INBOX_TOAST_LABEL}"]`)).toHaveCount(0);
    });

    await test.step("읽지 않은 메시지 DELETE는 토스트 없이 badge만 감소시킨다", async () => {
      await ownerPage.bringToFront();
      await sendMessage(ownerPage, deletedMessage);
      await expectConfirmedMessage(ownerMessageLog, deletedMessage);
      await expect(
        getParticipatingRoomCard(memberPage, roomName).getByLabel("읽지 않은 메시지 1개"),
      ).toBeVisible();
      await expect(getParticipatingRoomCard(memberPage, roomName)).toContainText(deletedMessage);

      await ownerMessageLog.getByRole("button", { name: deletedMessage, exact: true }).click();
      const mutationDialog = ownerPage.getByRole("dialog", { name: "메시지 작업" });
      await mutationDialog.getByRole("button", { name: "삭제", exact: true }).click();
      await expect(
        mutationDialog.getByText("이 메시지를 삭제할까요?", { exact: true }),
      ).toBeVisible();

      await memberPage.bringToFront();
      await expect.poll(() => memberPage.evaluate(() => document.hasFocus())).toBe(true);
      const inboxResponse = waitForRoomInbox(memberPage);
      await mutationDialog
        .getByRole("button", { name: "삭제", exact: true })
        .evaluate((button: HTMLButtonElement) => button.click());

      expect((await inboxResponse).ok(), "삭제 후 Room inbox 조회가 성공해야 합니다.").toBe(true);
      const roomCard = getParticipatingRoomCard(memberPage, roomName);
      await expect(roomCard.getByLabel(/읽지 않은 메시지/)).toHaveCount(0);
      await expect(roomCard).toContainText("삭제된 메시지입니다.");
      await expect(memberPage.locator(`aside[aria-label="${INBOX_TOAST_LABEL}"]`)).toHaveCount(0);
    });
  } finally {
    await Promise.all([ownerContext.close(), memberContext.close()]);
  }
});

function getParticipatingRoomCard(page: Page, roomName: string): Locator {
  return page.getByRole("link").filter({ hasText: roomName });
}

async function sendMessage(page: Page, content: string): Promise<void> {
  await page.getByRole("textbox", { name: "메시지" }).fill(content);
  await page.getByRole("button", { name: "전송", exact: true }).click();
}

async function expectConfirmedMessage(messageLog: Locator, content: string): Promise<void> {
  await expect(messageLog.getByText(content, { exact: true })).toBeVisible();
  await expect(
    messageLog.locator("li[data-delivery-status]").filter({ hasText: content }),
  ).toHaveCount(0);
}

function waitForRoomInbox(page: Page) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());

    return response.request().method() === "GET" && url.pathname === "/api/v1/me/room-inbox";
  });
}
