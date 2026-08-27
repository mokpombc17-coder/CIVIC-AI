import { expect, test, type Page } from "@playwright/test";
import {
  authenticateLocalE2EUserAs,
  createRoomAndEnter,
  joinPublicRoomAndEnter,
} from "./chat-e2e-helpers";

const ACTIVE_ROOM_LABEL = "채팅 가능";
const CONNECTED_STATUS_SELECTOR = '[data-chat-connection-status="connected"]';

test("신규 참여자는 참여 이전 메시지를 볼 수 없고 참여 이후 메시지만 복구한다", async ({
  browser,
}, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const roomName = `e2e-visibility-${uniqueId}`;
  const ownerSubject = `e2e-owner-${uniqueId}`;
  const memberSubject = `e2e-member-${uniqueId}`;
  const beforeJoinMessage = `참여 전 메시지 ${uniqueId}`;
  const afterJoinMessage = `참여 후 메시지 ${uniqueId}`;
  const ownerContext = await browser.newContext({ baseURL });
  const memberContext = await browser.newContext({ baseURL });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();

  try {
    await test.step("서로 다른 플랫폼 사용자로 로그인하고 공개 채팅방을 만든다", async () => {
      await authenticateLocalE2EUserAs(ownerPage, ownerContext, ownerSubject);
      await authenticateLocalE2EUserAs(memberPage, memberContext, memberSubject);
    });

    const roomId =
      await test.step("방장이 공개 채팅방을 만들고 실시간 구독을 준비한다", async () => {
        const createdRoomId = await createRoomAndEnter(ownerPage, roomName);

        await expect(ownerPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
        await expect(ownerPage.getByRole("textbox", { name: "메시지" })).toBeEnabled();

        return createdRoomId;
      });
    const ownerMessageLog = ownerPage.getByRole("log", { name: `${roomId} 메시지` });

    await test.step("방장이 신규 사용자 참여 전에 메시지를 전송한다", async () => {
      await ownerPage.getByRole("textbox", { name: "메시지" }).fill(beforeJoinMessage);
      await ownerPage.getByRole("button", { name: "전송", exact: true }).click();

      await expect(ownerMessageLog.getByText(beforeJoinMessage, { exact: true })).toBeVisible();
    });

    await test.step("신규 사용자가 방에 참여하면 참여 이전 메시지는 보이지 않는다", async () => {
      await joinPublicRoomAndEnter(memberPage, roomId, roomName);

      await expect(memberPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(memberPage.getByRole("textbox", { name: "메시지" })).toBeEnabled();

      const memberMessageLog = memberPage.getByRole("log", { name: `${roomId} 메시지` });
      await expect(memberMessageLog.getByText(beforeJoinMessage, { exact: true })).toHaveCount(0);
    });

    await test.step("참여 이후 메시지는 실시간으로 수신한다", async () => {
      await ownerPage.getByRole("textbox", { name: "메시지" }).fill(afterJoinMessage);
      await ownerPage.getByRole("button", { name: "전송", exact: true }).click();

      const memberMessageLog = memberPage.getByRole("log", { name: `${roomId} 메시지` });
      await expect(memberMessageLog.getByText(afterJoinMessage, { exact: true })).toBeVisible();
      await expect(memberMessageLog.getByText(beforeJoinMessage, { exact: true })).toHaveCount(0);
    });

    await test.step("새로고침 후에도 참여 경계 이후 메시지만 REST 이력으로 복구한다", async () => {
      const historyResponse = memberPage.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === `/api/v1/rooms/${roomId}/messages`,
      );

      await memberPage.reload();

      const response = await historyResponse;
      expect(response.ok(), `메시지 이력 조회가 성공해야 합니다: ${response.status()}`).toBe(true);
      await expect(memberPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(memberPage.getByRole("textbox", { name: "메시지" })).toBeEnabled();

      const memberMessageLog = memberPage.getByRole("log", { name: `${roomId} 메시지` });
      await expect(memberMessageLog.getByText(beforeJoinMessage, { exact: true })).toHaveCount(0);
      await expect(memberMessageLog.getByText(afterJoinMessage, { exact: true })).toBeVisible();
    });
  } finally {
    await Promise.all([ownerContext.close(), memberContext.close()]);
  }
});

test("재참여자는 이전 참여 구간과 퇴장 중 메시지를 볼 수 없고 4002 이후 다시 동기화한다", async ({
  browser,
}, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const roomName = `e2e-rejoin-${uniqueId}`;
  const ownerSubject = `e2e-rejoin-owner-${uniqueId}`;
  const memberSubject = `e2e-rejoin-member-${uniqueId}`;
  const previousParticipationMessage = `첫 참여 구간 메시지 ${uniqueId}`;
  const whileAwayMessage = `퇴장 중 메시지 ${uniqueId}`;
  const afterRejoinMessage = `재참여 후 메시지 ${uniqueId}`;
  const ownerContext = await browser.newContext({ baseURL });
  const memberContext = await browser.newContext({ baseURL });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();

  try {
    await test.step("서로 다른 플랫폼 사용자로 로그인하고 같은 공개 방에 참여한다", async () => {
      await authenticateLocalE2EUserAs(ownerPage, ownerContext, ownerSubject);
      await authenticateLocalE2EUserAs(memberPage, memberContext, memberSubject);
    });

    const roomId = await test.step("방을 만들고 두 사용자의 실시간 구독을 준비한다", async () => {
      const createdRoomId = await createRoomAndEnter(ownerPage, roomName);

      await expect(ownerPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await joinPublicRoomAndEnter(memberPage, createdRoomId, roomName);
      await expect(memberPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(memberPage.getByRole("textbox", { name: "메시지" })).toBeEnabled();

      return createdRoomId;
    });
    const ownerMessageLog = ownerPage.getByRole("log", { name: `${roomId} 메시지` });
    const memberMessageLog = memberPage.getByRole("log", { name: `${roomId} 메시지` });

    await test.step("첫 참여 구간의 메시지를 실시간으로 수신한다", async () => {
      await ownerPage.getByRole("textbox", { name: "메시지" }).fill(previousParticipationMessage);
      await ownerPage.getByRole("button", { name: "전송", exact: true }).click();

      await expect(
        ownerMessageLog.getByText(previousParticipationMessage, { exact: true }),
      ).toBeVisible();
      await expect(
        memberMessageLog.getByText(previousParticipationMessage, { exact: true }),
      ).toBeVisible();
    });

    await test.step("참여자가 방을 나가면 4002 이후 공통 연결을 새로 준비한다", async () => {
      memberPage.once("dialog", (dialog) => dialog.accept());
      await memberPage.getByRole("button", { name: "채팅방 메뉴", exact: true }).click();
      await memberPage.getByRole("button", { name: "방 나가기", exact: true }).click();

      await expect(memberPage).toHaveURL(/\/chat$/);
      await expect(memberPage.locator(CONNECTED_STATUS_SELECTOR)).toHaveCount(1);
    });

    await test.step("퇴장 중 생성된 메시지는 방장에게만 표시된다", async () => {
      await ownerPage.getByRole("textbox", { name: "메시지" }).fill(whileAwayMessage);
      await ownerPage.getByRole("button", { name: "전송", exact: true }).click();

      await expect(ownerMessageLog.getByText(whileAwayMessage, { exact: true })).toBeVisible();
    });

    await test.step("같은 문서에서 재참여하면 이전 Query cache를 비우고 새 경계로 동기화한다", async () => {
      await joinPublicRoomAndEnter(memberPage, roomId, roomName, {
        navigate: false,
      });

      await expect(memberPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(memberPage.getByRole("textbox", { name: "메시지" })).toBeEnabled();
      await expect(
        memberMessageLog.getByText(previousParticipationMessage, { exact: true }),
      ).toHaveCount(0);
      await expect(memberMessageLog.getByText(whileAwayMessage, { exact: true })).toHaveCount(0);
    });

    await test.step("재참여 이후 메시지는 다시 실시간으로 수신한다", async () => {
      await setDocumentFocusState(memberPage, false);
      await ownerPage.getByRole("textbox", { name: "메시지" }).fill(afterRejoinMessage);
      await ownerPage.getByRole("button", { name: "전송", exact: true }).click();

      await expect(memberMessageLog.getByText(afterRejoinMessage, { exact: true })).toBeVisible();

      const readStateResponse = waitForReadState(memberPage, roomId);
      await setDocumentFocusState(memberPage, true);

      expect(
        (await readStateResponse).ok(),
        "재참여 lifecycle에서 새 메시지 read-state PUT이 성공해야 합니다.",
      ).toBe(true);
    });

    await test.step("새로고침 후에도 새 참여 구간의 메시지만 복구한다", async () => {
      const historyResponse = memberPage.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === `/api/v1/rooms/${roomId}/messages`,
      );

      await memberPage.reload();

      const response = await historyResponse;
      expect(response.ok(), `메시지 이력 조회가 성공해야 합니다: ${response.status()}`).toBe(true);
      await expect(memberPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(memberPage.getByRole("textbox", { name: "메시지" })).toBeEnabled();
      await expect(
        memberMessageLog.getByText(previousParticipationMessage, { exact: true }),
      ).toHaveCount(0);
      await expect(memberMessageLog.getByText(whileAwayMessage, { exact: true })).toHaveCount(0);
      await expect(memberMessageLog.getByText(afterRejoinMessage, { exact: true })).toBeVisible();
    });
  } finally {
    await Promise.all([ownerContext.close(), memberContext.close()]);
  }
});

async function setDocumentFocusState(page: Page, focused: boolean): Promise<void> {
  await page.evaluate((nextFocused) => {
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => nextFocused,
    });
    window.dispatchEvent(new Event(nextFocused ? "focus" : "blur"));
  }, focused);
}

function waitForReadState(page: Page, roomId: string) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "PUT" && url.pathname === `/api/v1/rooms/${roomId}/read-state`
    );
  });
}
