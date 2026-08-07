import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  authenticateDevUserAs,
  createRoomAndEnter,
  joinPublicRoomAndEnter,
} from "./chat-e2e-helpers";

const ACTIVE_ROOM_LABEL = "채팅 가능";

test("같은 사용자의 다른 탭은 read-state 성공을 즉시 반영한다", async ({ browser }, testInfo) => {
  const fixture = await createReadStateFixture(browser, String(testInfo.project.use.baseURL));
  const listPage = await fixture.memberContext.newPage();
  const message = `cross-tab read-state ${fixture.uniqueId}`;

  try {
    await openRoomInbox(listPage, fixture.roomName);
    await listPage.bringToFront();
    await expect.poll(() => listPage.evaluate(() => document.hasFocus())).toBe(true);
    await setDocumentFocusState(fixture.memberPage, false);
    await expect.poll(() => fixture.memberPage.evaluate(() => document.hasFocus())).toBe(false);

    await sendMessage(fixture.ownerPage, message);
    await expectConfirmedMessage(fixture.ownerPage, fixture.roomId, message);
    const roomCard = getParticipatingRoomCard(listPage, fixture.roomName);
    await expect(roomCard.getByLabel("읽지 않은 메시지 1개")).toBeVisible();

    const readStateResponse = waitForReadState(fixture.memberPage, fixture.roomId);
    const peerInboxResponse = waitForRoomInbox(listPage);

    await fixture.memberPage.bringToFront();
    await setDocumentFocusState(fixture.memberPage, true);
    await expect.poll(() => fixture.memberPage.evaluate(() => document.hasFocus())).toBe(true);
    await expect(
      fixture.memberPage.getByRole("log", {
        name: `${fixture.roomId} 메시지`,
        includeHidden: true,
      }),
    ).toContainText(message);

    expect((await readStateResponse).ok(), "채팅방 탭의 read-state PUT이 성공해야 합니다.").toBe(
      true,
    );
    expect(
      (await peerInboxResponse).ok(),
      "목록 탭이 peer confirmation으로 Room inbox를 다시 조회해야 합니다.",
    ).toBe(true);
    await expect(roomCard.getByLabel(/읽지 않은 메시지/)).toHaveCount(0);
  } finally {
    await fixture.close();
  }
});

test("채팅 화면 unmount 뒤에도 최종 실패한 read-state를 focus에서 재시도한다", async ({
  browser,
}, testInfo) => {
  const fixture = await createReadStateFixture(browser, String(testInfo.project.use.baseURL));
  const message = `route retry read-state ${fixture.uniqueId}`;
  let failReadState = true;
  let failedRequestCount = 0;

  await fixture.memberPage.route(`**/api/v1/rooms/${fixture.roomId}/read-state`, async (route) => {
    if (!failReadState) {
      await route.continue();
      return;
    }

    failedRequestCount += 1;
    await route.fulfill({
      status: 503,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "urn:hamcheeze:problem:room-inbox-unavailable",
        title: "Room inbox unavailable",
        status: 503,
        detail: "The Room inbox is temporarily unavailable.",
        instance: `/api/v1/rooms/${fixture.roomId}/read-state`,
        code: "ROOM_INBOX_UNAVAILABLE",
        replayed: false,
        retryable: true,
      }),
    });
  });

  try {
    await fixture.memberPage.bringToFront();
    await expect.poll(() => fixture.memberPage.evaluate(() => document.hasFocus())).toBe(true);
    await sendMessage(fixture.ownerPage, message);
    await fixture.memberPage.bringToFront();
    await expect.poll(() => fixture.memberPage.evaluate(() => document.hasFocus())).toBe(true);
    await expect(
      fixture.memberPage.getByRole("log", {
        name: `${fixture.roomId} 메시지`,
        includeHidden: true,
      }),
    ).toContainText(message);
    await expect.poll(() => failedRequestCount, { timeout: 15_000 }).toBeGreaterThanOrEqual(4);

    await fixture.memberPage
      .getByRole("link", { name: "채팅방 목록으로 돌아가기", exact: true })
      .click();
    await expect(fixture.memberPage).toHaveURL(/\/chat$/);
    await expect(getParticipatingRoomCard(fixture.memberPage, fixture.roomName)).toBeVisible();

    failReadState = false;
    const recoveredReadState = waitForReadState(fixture.memberPage, fixture.roomId);
    await fixture.memberPage.evaluate(() => window.dispatchEvent(new Event("focus")));

    expect(
      (await recoveredReadState).ok(),
      "방 화면이 unmount된 뒤에도 보존한 sequence 재시도가 성공해야 합니다.",
    ).toBe(true);
    await expect(
      getParticipatingRoomCard(fixture.memberPage, fixture.roomName).getByLabel(/읽지 않은 메시지/),
    ).toHaveCount(0);
  } finally {
    await fixture.close();
  }
});

test("방 정보 overlay가 열린 동안에는 새 read-state를 보고하지 않고 닫힌 뒤 보고한다", async ({
  browser,
}, testInfo) => {
  const fixture = await createReadStateFixture(browser, String(testInfo.project.use.baseURL));
  const message = `overlay read-state ${fixture.uniqueId}`;

  try {
    await fixture.memberPage.bringToFront();
    await expect.poll(() => fixture.memberPage.evaluate(() => document.hasFocus())).toBe(true);
    await fixture.memberPage.getByRole("button", { name: "방 정보", exact: true }).click();
    const dialog = fixture.memberPage.getByRole("dialog", { name: "방 정보와 멤버십" });
    await expect(dialog).toBeVisible();

    await sendMessage(fixture.ownerPage, message);
    await fixture.memberPage.bringToFront();
    await expect.poll(() => fixture.memberPage.evaluate(() => document.hasFocus())).toBe(true);
    await expect(
      fixture.memberPage.locator(`[role="log"][aria-label="${fixture.roomId} 메시지"]`),
    ).toContainText(message);

    await expectNoReadStateRequest(fixture.memberPage, fixture.roomId);

    const readStateResponse = waitForReadState(fixture.memberPage, fixture.roomId);
    await dialog.getByRole("button", { name: "방 정보와 멤버십 닫기", exact: true }).click();
    await expect(dialog).toBeHidden();

    expect(
      (await readStateResponse).ok(),
      "overlay를 닫고 최신 메시지가 보이면 read-state PUT이 성공해야 합니다.",
    ).toBe(true);
  } finally {
    await fixture.close();
  }
});

type ReadStateFixture = Readonly<{
  close(): Promise<void>;
  memberContext: BrowserContext;
  memberPage: Page;
  ownerPage: Page;
  roomId: string;
  roomName: string;
  uniqueId: string;
}>;

async function createReadStateFixture(
  browser: Browser,
  baseURL: string,
): Promise<ReadStateFixture> {
  const uniqueId = crypto.randomUUID();
  const roomName = `e2e-read-state-${uniqueId}`;
  const ownerContext = await browser.newContext({ baseURL });
  const memberContext = await browser.newContext({ baseURL });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();

  try {
    await authenticateDevUserAs(ownerPage, ownerContext, `e2e-read-owner-${uniqueId}`);
    await authenticateDevUserAs(memberPage, memberContext, `e2e-read-member-${uniqueId}`);
    const roomId = await createRoomAndEnter(ownerPage, roomName);

    await expect(ownerPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
    await joinPublicRoomAndEnter(memberPage, roomId, roomName);
    await expect(
      memberPage.getByRole("status").filter({ hasText: ACTIVE_ROOM_LABEL }),
    ).toBeVisible();

    return {
      close: async () => {
        await Promise.all([ownerContext.close(), memberContext.close()]);
      },
      memberContext,
      memberPage,
      ownerPage,
      roomId,
      roomName,
      uniqueId,
    };
  } catch (error) {
    await Promise.all([ownerContext.close(), memberContext.close()]);
    throw error;
  }
}

async function openRoomInbox(page: Page, roomName: string): Promise<void> {
  const inboxResponse = waitForRoomInbox(page);
  await page.goto("/chat");
  expect((await inboxResponse).ok(), "Room inbox 조회가 성공해야 합니다.").toBe(true);
  await expect(getParticipatingRoomCard(page, roomName)).toBeVisible();
}

async function setDocumentFocusState(page: Page, focused: boolean): Promise<void> {
  await page.evaluate((nextFocused) => {
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => nextFocused,
    });
    window.dispatchEvent(new Event(nextFocused ? "focus" : "blur"));
  }, focused);
}

function getParticipatingRoomCard(page: Page, roomName: string): Locator {
  return page.getByRole("link").filter({ hasText: roomName });
}

async function sendMessage(page: Page, content: string): Promise<void> {
  await page.getByRole("textbox", { name: "메시지" }).fill(content);
  await page.getByRole("button", { name: "전송", exact: true }).click();
}

async function expectConfirmedMessage(page: Page, roomId: string, content: string): Promise<void> {
  const messageLog = page.getByRole("log", { name: `${roomId} 메시지` });
  await expect(messageLog.getByText(content, { exact: true })).toBeVisible();
  await expect(
    messageLog.locator("li[data-delivery-status]").filter({ hasText: content }),
  ).toHaveCount(0);
}

function waitForReadState(page: Page, roomId: string) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "PUT" && url.pathname === `/api/v1/rooms/${roomId}/read-state`
    );
  });
}

async function expectNoReadStateRequest(page: Page, roomId: string): Promise<void> {
  await expect(
    page.waitForRequest(
      (request) => {
        const url = new URL(request.url());
        return request.method() === "PUT" && url.pathname === `/api/v1/rooms/${roomId}/read-state`;
      },
      { timeout: 1_000 },
    ),
  ).rejects.toThrow();
}

function waitForRoomInbox(page: Page) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && url.pathname === "/api/v1/me/room-inbox";
  });
}
