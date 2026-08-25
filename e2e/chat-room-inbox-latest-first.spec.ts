import {
  expect,
  test,
  type APIResponse,
  type BrowserContext,
  type Locator,
  type Page,
  type Response,
} from "@playwright/test";
import { authenticateDevUserAs } from "./chat-e2e-helpers";

const ACTIVE_ROOM_LABEL = "채팅 가능";
const CONNECTED_LABEL = "실시간 연결: 연결됨";
const INBOX_TOAST_LABEL = "새 채팅 메시지 알림";
const CHAT_RESOURCE_SERVER_URL =
  process.env.CHAT_E2E_RESOURCE_SERVER_URL ?? "http://localhost:8082";
const ROOM_INBOX_PAGE_SIZE = 20;

type RoomFixture = Readonly<{
  roomId: string;
  roomName: string;
}>;

type RoomInboxLastMessage = Readonly<{
  messageId: string;
  messageVersion: number;
  preview: string | null;
  previewTruncated: boolean;
  roomSequence: number;
  state: "ACTIVE" | "DELETED_BY_AUTHOR";
}>;

type RoomInboxItem = Readonly<{
  lastActivityAt: string;
  lastMessage: RoomInboxLastMessage | null;
  name: string;
  roomId: string;
}>;

type RoomInboxPage = Readonly<{
  hasNext: boolean;
  items: readonly RoomInboxItem[];
  nextCursor: string | null;
}>;

type Actors = Readonly<{
  memberContext: BrowserContext;
  memberPage: Page;
  ownerContext: BrowserContext;
  ownerPage: Page;
}>;

test.describe("채팅방 목록 latest-first", () => {
  test.describe.configure({ mode: "serial" });

  test("CREATE만 Room 순서를 바꾸고 UPDATE/DELETE는 latest summary 위치를 유지한다", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(120_000);
    const uniqueId = crypto.randomUUID();
    const actors = await createActors(browser, testInfo, uniqueId, "ordering");
    const { memberPage, ownerPage } = actors;
    const roomAName = `e2e-latest-A-${uniqueId}`;
    const roomBName = `e2e-latest-B-${uniqueId}`;
    const bOld = `B-old-${uniqueId}`;
    const bOldEdited = `B-old-edited-${uniqueId}`;
    const bLatest = `B-latest-${uniqueId}`;
    const bLatestEdited = `B-latest-edited-${uniqueId}`;
    const aLatest = `A-latest-${uniqueId}`;
    const bNew = `B-new-${uniqueId}`;

    try {
      const roomA = await createRoom(ownerPage, roomAName);
      const roomB = await createRoom(ownerPage, roomBName);
      await joinRoom(memberPage, roomA.roomId);
      await joinRoom(memberPage, roomB.roomId);

      await enterRoom(ownerPage, roomB);
      await sendMessage(ownerPage, bOld);
      await sendMessage(ownerPage, bLatest);

      const initialResponsePromise = waitForFirstRoomInboxResponse(memberPage);
      await memberPage.goto("/chat");
      const initialPage = await readRoomInboxResponse(await initialResponsePromise);
      await expect(memberPage.getByText(CONNECTED_LABEL, { exact: true })).toBeVisible();
      await expectRoomOrder(memberPage, [roomB.roomId, roomA.roomId]);
      const bOriginalActivityAt = getRoomItem(initialPage, roomB.roomId).lastActivityAt;
      await expectRoomPreview(memberPage, roomB.roomId, bLatest);
      await expectRoomActivity(memberPage, roomB.roomId, bOriginalActivityAt);

      await enterRoom(ownerPage, roomA);
      await ownerPage.getByRole("textbox", { name: "메시지" }).fill(aLatest);
      await focusMember(ownerPage, memberPage);
      const aCreateRefresh = waitForFirstRoomInboxPageMatching(
        memberPage,
        (page) =>
          roomIds(page)[0] === roomA.roomId &&
          getOptionalRoomItem(page, roomA.roomId)?.lastMessage?.preview === aLatest,
      );
      await clickInBackground(ownerPage.getByRole("button", { name: "전송", exact: true }));
      await expectConfirmedMessage(ownerPage, roomA.roomId, aLatest);
      const aCreatePage = (await aCreateRefresh).page;
      expect(roomIds(aCreatePage).slice(0, 2)).toEqual([roomA.roomId, roomB.roomId]);
      await expectRoomOrder(memberPage, [roomA.roomId, roomB.roomId]);
      await expectRoomPreview(memberPage, roomA.roomId, aLatest);
      await expectRoomPreview(memberPage, roomB.roomId, bLatest);
      await expect(memberPage.locator(`aside[aria-label="${INBOX_TOAST_LABEL}"]`)).toBeVisible();
      await expect(memberPage.locator(`aside[aria-label="${INBOX_TOAST_LABEL}"]`)).toHaveCount(0, {
        timeout: 10_000,
      });

      await enterRoom(ownerPage, roomB);
      await editMessage(ownerPage, bOld, bOldEdited);
      const afterOldUpdate = await listRoomInbox(memberPage);
      expectRoomSummary(afterOldUpdate, roomB.roomId, bLatest, bOriginalActivityAt);
      await refreshMemberInbox(memberPage);
      await expectRoomOrder(memberPage, [roomA.roomId, roomB.roomId]);
      await expectRoomPreview(memberPage, roomB.roomId, bLatest);
      await expect(getRoomCard(memberPage, roomB.roomId)).not.toContainText(bOldEdited);

      await deleteMessage(ownerPage, bOldEdited);
      const afterOldDelete = await listRoomInbox(memberPage);
      expectRoomSummary(afterOldDelete, roomB.roomId, bLatest, bOriginalActivityAt);
      await refreshMemberInbox(memberPage);
      await expectRoomOrder(memberPage, [roomA.roomId, roomB.roomId]);
      await expectRoomPreview(memberPage, roomB.roomId, bLatest);
      await expect(getRoomCard(memberPage, roomB.roomId)).not.toContainText("삭제된 메시지입니다.");

      const latestEditDialog = await prepareEditMessage(ownerPage, bLatest, bLatestEdited);
      await focusMember(ownerPage, memberPage);
      const latestUpdateRefresh = waitForFirstRoomInboxPageMatching(
        memberPage,
        (page) => getOptionalRoomItem(page, roomB.roomId)?.lastMessage?.preview === bLatestEdited,
      );
      await clickInBackground(latestEditDialog.getByRole("button", { name: "저장", exact: true }));
      await expectConfirmedMessage(ownerPage, roomB.roomId, bLatestEdited);
      const latestUpdatePage = (await latestUpdateRefresh).page;
      expectRoomSummary(latestUpdatePage, roomB.roomId, bLatestEdited, bOriginalActivityAt);
      await expectRoomOrder(memberPage, [roomA.roomId, roomB.roomId]);
      await expectRoomPreview(memberPage, roomB.roomId, bLatestEdited);
      await expectRoomActivity(memberPage, roomB.roomId, bOriginalActivityAt);
      await expect(memberPage.locator(`aside[aria-label="${INBOX_TOAST_LABEL}"]`)).toHaveCount(0);

      const latestDeleteDialog = await prepareDeleteMessage(ownerPage, bLatestEdited);
      await focusMember(ownerPage, memberPage);
      const latestDeleteRefresh = waitForFirstRoomInboxPageMatching(
        memberPage,
        (page) =>
          getOptionalRoomItem(page, roomB.roomId)?.lastMessage?.state === "DELETED_BY_AUTHOR",
      );
      await clickInBackground(
        latestDeleteDialog.getByRole("button", { name: "삭제", exact: true }),
      );
      const latestDeletePage = (await latestDeleteRefresh).page;
      const deletedSummary = getRoomItem(latestDeletePage, roomB.roomId);
      expect(deletedSummary.lastMessage?.state).toBe("DELETED_BY_AUTHOR");
      expect(deletedSummary.lastActivityAt).toBe(bOriginalActivityAt);
      await expectRoomOrder(memberPage, [roomA.roomId, roomB.roomId]);
      await expectRoomPreview(memberPage, roomB.roomId, "삭제된 메시지입니다.");
      await expectRoomActivity(memberPage, roomB.roomId, bOriginalActivityAt);
      await expect(memberPage.locator(`aside[aria-label="${INBOX_TOAST_LABEL}"]`)).toHaveCount(0);

      await ownerPage.getByRole("textbox", { name: "메시지" }).fill(bNew);
      await focusMember(ownerPage, memberPage);
      const bCreateRefresh = waitForFirstRoomInboxPageMatching(
        memberPage,
        (page) =>
          roomIds(page)[0] === roomB.roomId &&
          getOptionalRoomItem(page, roomB.roomId)?.lastMessage?.preview === bNew,
      );
      await clickInBackground(ownerPage.getByRole("button", { name: "전송", exact: true }));
      await expectConfirmedMessage(ownerPage, roomB.roomId, bNew);
      const bCreatePage = (await bCreateRefresh).page;
      const bNewSummary = getRoomItem(bCreatePage, roomB.roomId);
      expect(roomIds(bCreatePage).slice(0, 2)).toEqual([roomB.roomId, roomA.roomId]);
      expect(bNewSummary.lastActivityAt).not.toBe(bOriginalActivityAt);
      expect(bNewSummary.lastMessage?.preview).toBe(bNew);
      await expectRoomOrder(memberPage, [roomB.roomId, roomA.roomId]);
      await expectRoomPreview(memberPage, roomB.roomId, bNew);

      await testInfo.attach("latest-first-ordering.json", {
        body: JSON.stringify(
          {
            bOriginalActivityAt,
            bNewActivityAt: bNewSummary.lastActivityAt,
            finalOrder: roomIds(bCreatePage).slice(0, 2),
            roomA,
            roomB,
          },
          null,
          2,
        ),
        contentType: "application/json",
      });
    } finally {
      await closeActors(actors);
    }
  });

  test("현재 Membership 접근 경계 이전 메시지를 preview와 활동 순서에 사용하지 않는다", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(90_000);
    const uniqueId = crypto.randomUUID();
    const actors = await createActors(browser, testInfo, uniqueId, "boundary");
    const { memberPage, ownerPage } = actors;
    const roomC = await createRoom(ownerPage, `e2e-boundary-C-${uniqueId}`);
    const baselineRoom = await createRoom(ownerPage, `e2e-boundary-base-${uniqueId}`);
    const beforeJoinMessage = `C-before-join-${uniqueId}`;
    const afterJoinMessage = `C-after-join-${uniqueId}`;
    const baselineMessage = `baseline-after-C-join-${uniqueId}`;

    try {
      await enterRoom(ownerPage, roomC);
      await sendMessage(ownerPage, beforeJoinMessage);
      const ownerInbox = await listRoomInbox(ownerPage);
      const preJoinActivityAt = getRoomItem(ownerInbox, roomC.roomId).lastActivityAt;

      await joinRoom(memberPage, roomC.roomId);
      await joinRoom(memberPage, baselineRoom.roomId);
      await enterRoom(ownerPage, baselineRoom);
      await sendMessage(ownerPage, baselineMessage);

      const initialResponsePromise = waitForFirstRoomInboxResponse(memberPage);
      await memberPage.goto("/chat");
      const initialPage = await readRoomInboxResponse(await initialResponsePromise);
      await expect(memberPage.getByText(CONNECTED_LABEL, { exact: true })).toBeVisible();
      const initialRoomC = getRoomItem(initialPage, roomC.roomId);
      expect(initialRoomC.lastMessage).toBeNull();
      expect(initialRoomC.lastActivityAt).not.toBe(preJoinActivityAt);
      await expectRoomOrder(memberPage, [baselineRoom.roomId, roomC.roomId]);
      await expectRoomPreview(memberPage, roomC.roomId, "표시할 메시지가 없습니다.");
      await expect(getRoomCard(memberPage, roomC.roomId)).not.toContainText(beforeJoinMessage);

      await enterRoom(ownerPage, roomC);
      await ownerPage.getByRole("textbox", { name: "메시지" }).fill(afterJoinMessage);
      await focusMember(ownerPage, memberPage);
      const afterJoinRefresh = waitForFirstRoomInboxPageMatching(
        memberPage,
        (page) =>
          roomIds(page)[0] === roomC.roomId &&
          getOptionalRoomItem(page, roomC.roomId)?.lastMessage?.preview === afterJoinMessage,
      );
      await clickInBackground(ownerPage.getByRole("button", { name: "전송", exact: true }));
      await expectConfirmedMessage(ownerPage, roomC.roomId, afterJoinMessage);
      const afterJoinPage = (await afterJoinRefresh).page;
      const afterJoinRoomC = getRoomItem(afterJoinPage, roomC.roomId);
      expect(afterJoinRoomC.lastMessage?.preview).toBe(afterJoinMessage);
      expect(afterJoinRoomC.lastActivityAt).not.toBe(initialRoomC.lastActivityAt);
      expect(afterJoinRoomC.lastActivityAt).not.toBe(preJoinActivityAt);
      expect(roomIds(afterJoinPage).slice(0, 2)).toEqual([roomC.roomId, baselineRoom.roomId]);
      await expectRoomOrder(memberPage, [roomC.roomId, baselineRoom.roomId]);
      await expectRoomPreview(memberPage, roomC.roomId, afterJoinMessage);

      await testInfo.attach("membership-boundary.json", {
        body: JSON.stringify(
          {
            afterJoinActivityAt: afterJoinRoomC.lastActivityAt,
            initialVisibleActivityAt: initialRoomC.lastActivityAt,
            preJoinActivityAt,
            roomC,
          },
          null,
          2,
        ),
        contentType: "application/json",
      });
    } finally {
      await closeActors(actors);
    }
  });

  test("두 번째 페이지 Room의 CREATE가 page chain을 초기화하고 새 cursor로 재구성한다", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(180_000);
    const uniqueId = crypto.randomUUID();
    const actors = await createActors(browser, testInfo, uniqueId, "pagination");
    const { memberPage, ownerPage } = actors;
    const fixtures: RoomFixture[] = [];

    try {
      // Fixture JOIN invalidations must not race with the page-chain behavior under test.
      await memberPage.goto("about:blank");

      for (let index = 0; index < ROOM_INBOX_PAGE_SIZE + 1; index += 1) {
        const room = await createRoom(
          ownerPage,
          `e2e-page-${String(index + 1).padStart(2, "0")}-${uniqueId}`,
        );
        await joinRoom(memberPage, room.roomId);
        fixtures.push(room);
      }

      const initialFirstPagePromise = waitForFirstRoomInboxResponse(memberPage);
      await memberPage.goto("/chat");
      const initialFirstResponse = await initialFirstPagePromise;
      const initialFirstPage = await readRoomInboxResponse(initialFirstResponse);
      expect(readCursor(initialFirstResponse)).toBeNull();
      expect(new URL(initialFirstResponse.url()).searchParams.get("limit")).toBe(
        String(ROOM_INBOX_PAGE_SIZE),
      );
      expect(initialFirstPage.items).toHaveLength(ROOM_INBOX_PAGE_SIZE);
      expect(initialFirstPage.hasNext).toBe(true);
      expect(initialFirstPage.nextCursor).toEqual(expect.any(String));
      const initialFirstIds = roomIds(initialFirstPage);
      await expectRenderedRoomIds(memberPage, initialFirstIds);

      const oldSecondPagePromise = waitForCursorRoomInboxResponse(memberPage);
      await memberPage.getByRole("button", { name: "참여 중인 방 더 보기", exact: true }).click();
      const oldSecondResponse = await oldSecondPagePromise;
      const oldSecondPage = await readRoomInboxResponse(oldSecondResponse);
      const oldSecondPageRequestCursor = readCursor(oldSecondResponse);
      expect(oldSecondPageRequestCursor).toBe(initialFirstPage.nextCursor);
      expect(oldSecondPage.items).toHaveLength(1);
      const targetRoomId = oldSecondPage.items[0]!.roomId;
      const targetRoom = fixtures.find((room) => room.roomId === targetRoomId);
      expect(targetRoom, "두 번째 페이지 target Room fixture가 존재해야 합니다.").toBeDefined();
      const beforeIds = [...initialFirstIds, ...roomIds(oldSecondPage)];
      expect(new Set(beforeIds).size).toBe(ROOM_INBOX_PAGE_SIZE + 1);
      await expectRenderedRoomIds(memberPage, beforeIds);

      await enterRoom(ownerPage, targetRoom!);
      const targetMessage = `target-room-new-message-${uniqueId}`;
      await ownerPage.getByRole("textbox", { name: "메시지" }).fill(targetMessage);
      await focusMember(ownerPage, memberPage);
      const resetFirstPagePromise = waitForFirstRoomInboxPageMatching(
        memberPage,
        (page) =>
          roomIds(page)[0] === targetRoomId &&
          getOptionalRoomItem(page, targetRoomId)?.lastMessage?.preview === targetMessage,
      );
      await clickInBackground(ownerPage.getByRole("button", { name: "전송", exact: true }));
      await expectConfirmedMessage(ownerPage, targetRoomId, targetMessage);
      const { page: resetFirstPage, response: resetFirstResponse } = await resetFirstPagePromise;
      expect(readCursor(resetFirstResponse)).toBeNull();
      expect(roomIds(resetFirstPage)[0]).toBe(targetRoomId);
      expect(getRoomItem(resetFirstPage, targetRoomId).lastMessage?.preview).toBe(targetMessage);
      const newFirstPageNextCursor = resetFirstPage.nextCursor;
      expect(newFirstPageNextCursor).toEqual(expect.any(String));
      expect(newFirstPageNextCursor).not.toBe(oldSecondPageRequestCursor);

      const resetFirstIds = roomIds(resetFirstPage);
      await expectRenderedRoomIds(memberPage, resetFirstIds);
      expect(resetFirstIds).toHaveLength(ROOM_INBOX_PAGE_SIZE);
      expect(resetFirstIds.filter((roomId) => roomId === targetRoomId)).toHaveLength(1);
      await expectRoomPreview(memberPage, targetRoomId, targetMessage);
      await expect(
        memberPage.getByRole("button", { name: "참여 중인 방 더 보기", exact: true }),
      ).toBeVisible();

      const newSecondPagePromise = waitForCursorRoomInboxResponse(memberPage);
      await memberPage.getByRole("button", { name: "참여 중인 방 더 보기", exact: true }).click();
      const newSecondResponse = await newSecondPagePromise;
      const newSecondPage = await readRoomInboxResponse(newSecondResponse);
      const newSecondPageRequestCursor = readCursor(newSecondResponse);
      expect(newSecondPageRequestCursor).toBe(newFirstPageNextCursor);
      expect(newSecondPageRequestCursor).not.toBe(oldSecondPageRequestCursor);
      const afterIds = [...resetFirstIds, ...roomIds(newSecondPage)];
      expect(afterIds).toHaveLength(ROOM_INBOX_PAGE_SIZE + 1);
      expect(new Set(afterIds).size).toBe(ROOM_INBOX_PAGE_SIZE + 1);
      expect(afterIds.filter((roomId) => roomId === targetRoomId)).toHaveLength(1);
      expect(new Set(afterIds)).toEqual(new Set(beforeIds));
      await expectRenderedRoomIds(memberPage, afterIds);

      await testInfo.attach("room-inbox-page-chain.json", {
        body: JSON.stringify(
          {
            afterIds,
            beforeIds,
            newFirstPageNextCursor,
            newSecondPageRequestCursor,
            oldFirstPageNextCursor: initialFirstPage.nextCursor,
            oldSecondPageRequestCursor,
            targetRoom,
          },
          null,
          2,
        ),
        contentType: "application/json",
      });
    } finally {
      await closeActors(actors);
    }
  });
});

async function createActors(
  browser: Parameters<Parameters<typeof test>[1]>[0]["browser"],
  testInfo: Parameters<Parameters<typeof test>[1]>[1],
  uniqueId: string,
  scenario: string,
): Promise<Actors> {
  const baseURL = String(testInfo.project.use.baseURL);
  const ownerContext = await browser.newContext({ baseURL });
  const memberContext = await browser.newContext({ baseURL });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();

  await authenticateDevUserAs(ownerPage, ownerContext, `e2e-latest-owner-${scenario}-${uniqueId}`);
  await authenticateDevUserAs(
    memberPage,
    memberContext,
    `e2e-latest-member-${scenario}-${uniqueId}`,
  );

  return { memberContext, memberPage, ownerContext, ownerPage };
}

async function closeActors(actors: Actors): Promise<void> {
  await Promise.all([actors.ownerContext.close(), actors.memberContext.close()]);
}

async function createRoom(page: Page, roomName: string): Promise<RoomFixture> {
  const response = await page.request.post(chatApiUrl("/rooms"), {
    data: {
      categories: ["POLICY"],
      description: `latest-first E2E fixture ${roomName}`,
      joinPolicy: "OPEN",
      name: roomName,
      visibility: "LISTED",
    },
    headers: {
      "Idempotency-Key": crypto.randomUUID(),
    },
  });
  await assertApiSuccess(response, `Room ${roomName} 생성`);
  const body = (await response.json()) as { roomId?: unknown };
  expect(body.roomId).toEqual(expect.any(String));

  return { roomId: String(body.roomId), roomName };
}

async function joinRoom(page: Page, roomId: string): Promise<void> {
  const response = await page.request.post(chatApiUrl(`/rooms/${roomId}/commands/join`), {
    headers: {
      "Idempotency-Key": crypto.randomUUID(),
    },
  });
  await assertApiSuccess(response, `Room ${roomId} 참여`);
}

async function listRoomInbox(page: Page, cursor?: string): Promise<RoomInboxPage> {
  const url = new URL(chatApiUrl("/me/room-inbox"));
  url.searchParams.set("limit", String(ROOM_INBOX_PAGE_SIZE));

  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  const response = await page.request.get(url.toString());
  await assertApiSuccess(response, "Room inbox 직접 조회");
  return (await response.json()) as RoomInboxPage;
}

async function assertApiSuccess(response: APIResponse, operation: string): Promise<void> {
  if (response.ok()) {
    return;
  }

  throw new Error(`${operation} 실패: HTTP ${response.status()} ${await response.text()}`);
}

function chatApiUrl(path: string): string {
  return new URL(`/api/v1${path}`, CHAT_RESOURCE_SERVER_URL).toString();
}

async function enterRoom(page: Page, room: RoomFixture): Promise<void> {
  await page.goto(`/chat/${room.roomId}`);
  await expect(page.getByRole("heading", { name: room.roomName, exact: true })).toBeVisible();
  await expect(page.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "메시지" })).toBeEnabled();
}

async function sendMessage(page: Page, content: string): Promise<void> {
  await page.getByRole("textbox", { name: "메시지" }).fill(content);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  const roomId = readRoomId(page.url());
  await expectConfirmedMessage(page, roomId, content);
}

async function editMessage(page: Page, content: string, editedContent: string): Promise<void> {
  const dialog = await prepareEditMessage(page, content, editedContent);
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "메시지 작업" })).toHaveCount(0);
  await expectConfirmedMessage(page, readRoomId(page.url()), editedContent);
}

async function prepareEditMessage(
  page: Page,
  content: string,
  editedContent: string,
): Promise<Locator> {
  const messageLog = page.getByRole("log", { name: `${readRoomId(page.url())} 메시지` });
  await messageLog.getByRole("button", { name: content, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "메시지 작업" });
  await dialog.getByRole("button", { name: "수정", exact: true }).click();
  await dialog.getByRole("textbox", { name: "메시지 수정" }).fill(editedContent);
  return dialog;
}

async function deleteMessage(page: Page, content: string): Promise<void> {
  const dialog = await prepareDeleteMessage(page, content);
  await dialog.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "메시지 작업" })).toHaveCount(0);
}

async function prepareDeleteMessage(page: Page, content: string): Promise<Locator> {
  const messageLog = page.getByRole("log", { name: `${readRoomId(page.url())} 메시지` });
  await messageLog.getByRole("button", { name: content, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "메시지 작업" });
  await dialog.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(dialog.getByText("이 메시지를 삭제할까요?", { exact: true })).toBeVisible();
  return dialog;
}

async function expectConfirmedMessage(page: Page, roomId: string, content: string): Promise<void> {
  const messageLog = page.getByRole("log", { name: `${roomId} 메시지` });
  await expect(messageLog.getByText(content, { exact: true })).toBeVisible();
  await expect(
    messageLog.locator("li[data-delivery-status]").filter({ hasText: content }),
  ).toHaveCount(0);
}

async function focusMember(ownerPage: Page, memberPage: Page): Promise<void> {
  await ownerPage.bringToFront();
  await expect.poll(() => ownerPage.evaluate(() => document.hasFocus())).toBe(true);
  await memberPage.bringToFront();
  await expect.poll(() => memberPage.evaluate(() => document.hasFocus())).toBe(true);
}

async function refreshMemberInbox(memberPage: Page): Promise<void> {
  const refresh = waitForFirstRoomInboxResponse(memberPage);
  const [, response] = await Promise.all([memberPage.reload(), refresh]);

  expect(response.ok(), `Room inbox 조회가 성공해야 합니다: ${response.status()}`).toBe(true);
}

async function clickInBackground(locator: Locator): Promise<void> {
  await locator.evaluate((element: HTMLButtonElement) => element.click());
}

function waitForFirstRoomInboxResponse(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) => isRoomInboxResponse(response) && readCursor(response) === null,
  );
}

function waitForCursorRoomInboxResponse(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) => isRoomInboxResponse(response) && readCursor(response) !== null,
  );
}

async function waitForFirstRoomInboxPageMatching(
  browserPage: Page,
  predicate: (page: RoomInboxPage) => boolean,
): Promise<Readonly<{ page: RoomInboxPage; response: Response }>> {
  for (;;) {
    const response = await waitForFirstRoomInboxResponse(browserPage);
    const page = await readRoomInboxResponse(response);

    if (predicate(page)) {
      return { page, response };
    }
  }
}

function isRoomInboxResponse(response: Response): boolean {
  const url = new URL(response.url());
  return response.request().method() === "GET" && url.pathname === "/api/v1/me/room-inbox";
}

function readCursor(response: Response): string | null {
  return new URL(response.url()).searchParams.get("cursor");
}

async function readRoomInboxResponse(response: Response): Promise<RoomInboxPage> {
  expect(response.ok(), `Room inbox 조회가 성공해야 합니다: ${response.status()}`).toBe(true);
  return (await response.json()) as RoomInboxPage;
}

function getRoomItem(page: RoomInboxPage, roomId: string): RoomInboxItem {
  const item = getOptionalRoomItem(page, roomId);
  expect(item, `${roomId}가 Room inbox 응답에 포함되어야 합니다.`).toBeDefined();
  return item!;
}

function getOptionalRoomItem(page: RoomInboxPage, roomId: string): RoomInboxItem | undefined {
  return page.items.find((candidate) => candidate.roomId === roomId);
}

function roomIds(page: RoomInboxPage): string[] {
  return page.items.map((item) => item.roomId);
}

function expectRoomSummary(
  page: RoomInboxPage,
  roomId: string,
  expectedPreview: string,
  expectedActivityAt: string,
): void {
  const room = getRoomItem(page, roomId);
  expect(room.lastMessage?.preview).toBe(expectedPreview);
  expect(room.lastActivityAt).toBe(expectedActivityAt);
}

function getParticipatingRoomList(page: Page): Locator {
  return page.getByRole("list", { name: "참여 중인 채팅방" });
}

function getRoomCard(page: Page, roomId: string): Locator {
  return getParticipatingRoomList(page).locator(`article[data-room-id="${roomId}"]`);
}

async function expectRoomOrder(
  page: Page,
  expectedLeadingRoomIds: readonly string[],
): Promise<void> {
  await expect
    .poll(async () => (await getRenderedRoomIds(page)).slice(0, expectedLeadingRoomIds.length))
    .toEqual(expectedLeadingRoomIds);
}

async function expectRenderedRoomIds(
  page: Page,
  expectedRoomIds: readonly string[],
): Promise<void> {
  await expect.poll(() => getRenderedRoomIds(page)).toEqual(expectedRoomIds);
}

async function getRenderedRoomIds(page: Page): Promise<string[]> {
  return getParticipatingRoomList(page)
    .getByRole("article")
    .evaluateAll((cards) => cards.map((card) => card.dataset.roomId ?? ""));
}

async function expectRoomPreview(page: Page, roomId: string, preview: string): Promise<void> {
  await expect(getRoomCard(page, roomId)).toContainText(preview);
}

async function expectRoomActivity(page: Page, roomId: string, activityAt: string): Promise<void> {
  await expect(getRoomCard(page, roomId).locator("time")).toHaveAttribute("datetime", activityAt);
}

function readRoomId(url: string): string {
  const roomId = new URL(url).pathname.split("/").filter(Boolean).at(-1);

  if (!roomId) {
    throw new Error(`채팅방 URL에서 roomId를 찾지 못했습니다: ${url}`);
  }

  return roomId;
}
