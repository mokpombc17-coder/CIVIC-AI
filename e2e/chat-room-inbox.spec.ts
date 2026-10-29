import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import {
  authenticateLocalE2EUserAs,
  createE2ERoomName,
  createRoomAndEnter,
  findPublicRoomCard,
  joinPublicRoomAndEnter,
} from "./chat-e2e-helpers";

const ACTIVE_ROOM_LABEL = "채팅 가능";
const CONNECTED_STATUS_SELECTOR = '[data-chat-connection-status="connected"]';
const INBOX_TOAST_LABEL = "새 채팅 메시지 알림";

test("개인 inbox 이벤트로 unread를 갱신하고 실제 확인 위치를 읽음 처리한다", async ({
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const roomName = createE2ERoomName("inbox");
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
      await authenticateLocalE2EUserAs(ownerPage, ownerContext, ownerSubject);
      await authenticateLocalE2EUserAs(memberPage, memberContext, memberSubject);
    });

    const roomId = await test.step("방을 만들고 참여자의 개인 inbox 구독을 준비한다", async () => {
      const createdRoomId = await createRoomAndEnter(ownerPage, roomName);

      await expect(ownerPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await joinPublicRoomAndEnter(memberPage, createdRoomId, roomName);
      await expect(memberPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();

      const inboxResponse = waitForRoomInbox(memberPage);
      await memberPage.goto("/chat");
      expect((await inboxResponse).ok(), "초기 Room inbox 조회가 성공해야 합니다.").toBe(true);
      await expect(memberPage.locator(CONNECTED_STATUS_SELECTOR)).toHaveCount(1);
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
      await expect(getParticipatingRoomCard(memberPage, roomName)).toContainText("읽지 않음 1");
      await expect(getParticipatingRoomCard(memberPage, roomName)).not.toContainText(readMessage);
    });

    await test.step("메시지가 렌더링된 뒤 확정 sequence를 PUT하고 badge를 제거한다", async () => {
      const readStateResponse = memberPage.waitForResponse((response) => {
        const url = new URL(response.url());

        return (
          response.request().method() === "PUT" &&
          url.pathname === `/api/v1/rooms/${roomId}/read-state`
        );
      });

      const entryRoomCard = getParticipatingRoomCard(memberPage, roomName);
      await entryRoomCard
        .getByRole("link", { name: `${roomName} 토론방 입장`, exact: true })
        .click();
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
      await expect(roomCard).toContainText("새 메시지 없음");
      await expect(memberPage.locator(`aside[aria-label="${INBOX_TOAST_LABEL}"]`)).toHaveCount(0, {
        timeout: 10_000,
      });
    });

    await test.step("latest message UPDATE는 토스트와 unread 상태를 바꾸지 않는다", async () => {
      await ownerPage.bringToFront();
      await ownerMessageLog.getByRole("button", { name: readMessage, exact: true }).click();
      const mutationDialog = ownerPage.getByRole("dialog", { name: /^메시지( 수정| 삭제)?$/ });
      await mutationDialog.getByRole("button", { name: "수정", exact: true }).click();
      await mutationDialog.getByRole("textbox", { name: "선택한 메시지" }).fill(editedMessage);

      await memberPage.bringToFront();
      await expect.poll(() => memberPage.evaluate(() => document.hasFocus())).toBe(true);
      const inboxResponse = waitForRoomInbox(memberPage);
      await mutationDialog
        .getByRole("button", { name: "저장", exact: true })
        .evaluate((button: HTMLButtonElement) => button.click());

      expect((await inboxResponse).ok(), "수정 후 Room inbox 조회가 성공해야 합니다.").toBe(true);
      const roomCard = getParticipatingRoomCard(memberPage, roomName);
      await expect(roomCard).not.toContainText(editedMessage);
      await expect(roomCard).toContainText("새 메시지 없음");
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
      await expect(getParticipatingRoomCard(memberPage, roomName)).toContainText("읽지 않음 1");
      await expect(getParticipatingRoomCard(memberPage, roomName)).not.toContainText(
        deletedMessage,
      );

      await ownerMessageLog.getByRole("button", { name: deletedMessage, exact: true }).click();
      const mutationDialog = ownerPage.getByRole("dialog", { name: /^메시지( 수정| 삭제)?$/ });
      await mutationDialog.getByRole("button", { name: "삭제", exact: true }).click();
      await expect(
        mutationDialog.getByText("정말 이 메시지를 삭제하시겠습니까?", { exact: true }),
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
      await expect(roomCard).toContainText("새 메시지 없음");
      await expect(memberPage.locator(`aside[aria-label="${INBOX_TOAST_LABEL}"]`)).toHaveCount(0);
    });
  } finally {
    await Promise.all([ownerContext.close(), memberContext.close()]);
  }
});

test("목록 재조회가 끝나지 않아도 방 생성과 참여는 바로 방으로 이동한다", async ({
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const roomName = createE2ERoomName("list-held");
  const ownerContext = await browser.newContext({ baseURL });
  const memberContext = await browser.newContext({ baseURL });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();

  try {
    await authenticateLocalE2EUserAs(ownerPage, ownerContext, `e2e-held-owner-${uniqueId}`);
    await authenticateLocalE2EUserAs(memberPage, memberContext, `e2e-held-member-${uniqueId}`);

    const roomId =
      await test.step("목록 재조회를 붙잡은 채 방을 만들면 바로 방으로 이동한다", async () => {
        await ownerPage.goto("/chat");
        await expect(ownerPage.getByRole("heading", { name: "토론방", exact: true })).toBeVisible();
        await ownerPage.getByRole("button", { name: "토론방 생성 요청", exact: true }).click();
        await ownerPage.getByRole("textbox", { name: "제목" }).fill(roomName);
        await ownerPage
          .getByRole("textbox", { name: "상세 설명" })
          .fill(`${roomName} E2E 테스트용 설명입니다.`);

        const heldLists = await holdRoomListRefreshes(ownerPage);
        await ownerPage.getByRole("button", { name: "요청하기", exact: true }).click();

        await expect(ownerPage).toHaveURL(/\/chat\/[A-Za-z0-9_-]+$/);
        await expect(ownerPage.getByRole("heading", { name: roomName, exact: true })).toBeVisible();
        expect(heldLists.count(), "생성 후 목록 재조회가 붙잡힌 상태여야 합니다.").toBeGreaterThan(
          0,
        );
        await heldLists.release();

        return new URL(ownerPage.url()).pathname.split("/").at(-1)!;
      });

    await test.step("목록 재조회를 붙잡은 채 방에 참여하면 바로 방으로 이동한다", async () => {
      await memberPage.goto("/chat");
      const roomCard = await findPublicRoomCard(memberPage, roomName);
      await roomCard.getByRole("button", { name: `${roomName} 참여하기`, exact: true }).click();
      const roomDetail = memberPage.getByRole("dialog", { name: roomName, exact: true });

      const heldLists = await holdRoomListRefreshes(memberPage);
      await roomDetail.getByRole("button", { name: "참여하기", exact: true }).click();

      await expect(memberPage).toHaveURL(new RegExp(`/chat/${roomId}$`));
      await expect(memberPage.getByRole("heading", { name: roomName, exact: true })).toBeVisible();
      await expect(memberPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      expect(heldLists.count(), "참여 후 목록 재조회가 붙잡힌 상태여야 합니다.").toBeGreaterThan(0);
      await heldLists.release();
    });
  } finally {
    await Promise.all([ownerContext.close(), memberContext.close()]);
  }
});

// 느린 네트워크를 흉내 내려고 목록 조회 응답을 테스트가 풀어 줄 때까지 보내지 않음
async function holdRoomListRefreshes(
  page: Page,
): Promise<{ count: () => number; release: () => Promise<void> }> {
  const listPaths = new Set([
    "/api/v1/rooms",
    "/api/v1/me/rooms",
    "/api/v1/me/room-inbox",
    "/api/v1/me/room-creation-requests",
  ]);
  const isListRequest = (url: URL) => listPaths.has(url.pathname);
  const heldRoutes: Route[] = [];

  await page.route(isListRequest, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    heldRoutes.push(route);
  });

  return {
    count: () => heldRoutes.length,
    release: async () => {
      await page.unroute(isListRequest);
      // 붙잡는 동안 화면이 바뀌어 요청이 이미 취소됐을 수 있으므로 continue 실패는 무시함
      await Promise.all(heldRoutes.map((route) => route.continue().catch(() => undefined)));
    },
  };
}

function getParticipatingRoomCard(page: Page, roomName: string): Locator {
  return page
    .getByRole("list", { name: "참여 중인 토론방" })
    .getByRole("article")
    .filter({ hasText: roomName });
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
