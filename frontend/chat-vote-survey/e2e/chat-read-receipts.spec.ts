import {
  expect,
  test,
  type APIResponse,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  authenticateLocalE2EUserAs,
  createE2ERoomName,
  createRoomAndEnter,
  joinPublicRoomAndEnter,
} from "./chat-e2e-helpers";
import {
  enableSharedWorkerNetwork,
  findNewSharedWorkerTargetId,
  setSharedWorkerOffline,
} from "./chat-shared-worker-e2e-helpers";

const ACTIVE_ROOM_LABEL = "채팅 가능";
const RECONNECTING_LABEL = "준비 중";
const CHAT_RESOURCE_SERVER_URL =
  process.env.CHAT_E2E_RESOURCE_SERVER_URL ?? "http://localhost:8082";

test("두 사용자의 read cursor로 내 메시지의 안 읽은 인원을 표시하고 snapshot으로 복구한다", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const roomName = createE2ERoomName("receipt");
  const ownerMessage = `방장 Read Receipt ${uniqueId}`;
  const memberMessage = `참여자 Read Receipt ${uniqueId}`;
  const deletedMessage = `삭제 전 Read Receipt ${uniqueId}`;
  const topologyMessage = `퇴장 전 Read Receipt ${uniqueId}`;
  const browserSession = await browser.newBrowserCDPSession();
  const existingSharedWorkerTargetIds = new Set(
    (await browserSession.send("Target.getTargets")).targetInfos
      .filter((target) => target.type === "shared_worker")
      .map((target) => target.targetId),
  );
  const ownerContext = await browser.newContext({ baseURL });
  const memberContext = await browser.newContext({ baseURL });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  let ownerWorkerSessionId: string | null = null;

  try {
    await authenticateLocalE2EUserAs(ownerPage, ownerContext, `e2e-receipt-owner-${uniqueId}`);
    const roomId = await createRoomAndEnter(ownerPage, roomName);
    await expect(ownerPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();

    const ownerWorkerTargetId = await findNewSharedWorkerTargetId(
      browserSession,
      existingSharedWorkerTargetIds,
    );
    const attachedOwnerWorker = await browserSession.send("Target.attachToTarget", {
      targetId: ownerWorkerTargetId,
      flatten: false,
    });
    ownerWorkerSessionId = attachedOwnerWorker.sessionId;
    await enableSharedWorkerNetwork(browserSession, ownerWorkerSessionId);

    await authenticateLocalE2EUserAs(memberPage, memberContext, `e2e-receipt-member-${uniqueId}`);
    const ownerTopologySnapshot = waitForReceiptState(ownerPage, roomId);
    const memberInitialSnapshot = waitForReceiptState(memberPage, roomId);
    await joinPublicRoomAndEnter(memberPage, roomId, roomName);
    await expect(memberPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();

    const [ownerSnapshotResponse, memberSnapshotResponse] = await Promise.all([
      ownerTopologySnapshot,
      memberInitialSnapshot,
    ]);
    await expectActiveMembershipPositions(ownerSnapshotResponse, 2);
    await expectActiveMembershipPositions(memberSnapshotResponse, 2);

    const ownerMessageLog = ownerPage.getByRole("log", { name: `${roomId} 메시지` });
    const memberMessageLog = memberPage.getByRole("log", { name: `${roomId} 메시지` });

    await test.step("내 메시지에 안 읽은 인원을 표시하고 상대가 읽으면 숨긴다", async () => {
      await setDocumentFocusState(memberPage, false);
      await ownerPage.bringToFront();
      await setDocumentFocusState(ownerPage, true);

      await sendMessage(ownerPage, ownerMessage);
      await expectConfirmedMessage(ownerMessageLog, ownerMessage);
      await expectConfirmedMessage(memberMessageLog, ownerMessage);

      const ownerRow = getMessageRow(ownerMessageLog, ownerMessage);
      const memberRow = getMessageRow(memberMessageLog, ownerMessage);
      await expectUnreadCount(ownerRow, 1);
      await expect(memberRow.locator("[data-unread-count]")).toHaveCount(0);

      const memberReadStateResponse = waitForReadState(memberPage, roomId);
      await memberPage.bringToFront();
      await setDocumentFocusState(memberPage, true);
      expect((await memberReadStateResponse).ok()).toBe(true);

      await expect(ownerRow.locator("[data-unread-count]")).toHaveCount(0);
    });

    await test.step("상대가 작성한 메시지도 내가 읽으면 상대 화면에서 안 읽은 인원을 숨긴다", async () => {
      await setDocumentFocusState(ownerPage, false);
      await memberPage.bringToFront();
      await setDocumentFocusState(memberPage, true);

      await sendMessage(memberPage, memberMessage);
      await expectConfirmedMessage(ownerMessageLog, memberMessage);
      await expectConfirmedMessage(memberMessageLog, memberMessage);

      const ownerRow = getMessageRow(ownerMessageLog, memberMessage);
      const memberRow = getMessageRow(memberMessageLog, memberMessage);
      await expectUnreadCount(memberRow, 1);
      await expect(ownerRow.locator("[data-unread-count]")).toHaveCount(0);

      const ownerReadStateResponse = waitForReadState(ownerPage, roomId);
      await ownerPage.bringToFront();
      await setDocumentFocusState(ownerPage, true);
      expect((await ownerReadStateResponse).ok()).toBe(true);

      await expect(memberRow.locator("[data-unread-count]")).toHaveCount(0);
    });

    // 이후 단계는 참여자가 읽지 않은 상태를 유지해야 안 읽은 인원 변화를 확인할 수 있음
    await setDocumentFocusState(memberPage, false);
    await ownerPage.bringToFront();
    await setDocumentFocusState(ownerPage, true);

    const deletedClientMessageId =
      await test.step("안 읽은 메시지를 삭제하면 tombstone에서 안 읽은 인원을 숨긴다", async () => {
        await sendMessage(ownerPage, deletedMessage);
        await expectConfirmedMessage(ownerMessageLog, deletedMessage);
        await expectConfirmedMessage(memberMessageLog, deletedMessage);

        const ownerRow = getMessageRow(ownerMessageLog, deletedMessage);
        await expectUnreadCount(ownerRow, 1);
        const clientMessageId = await ownerRow.getAttribute("data-client-message-id");
        expect(clientMessageId).not.toBeNull();

        await ownerRow.getByRole("button", { name: deletedMessage, exact: true }).click();
        const mutationDialog = ownerPage.getByRole("dialog", { name: /^메시지( 수정| 삭제)?$/ });
        await mutationDialog.getByRole("button", { name: "삭제", exact: true }).click();
        await expect(
          mutationDialog.getByText("정말 이 메시지를 삭제하시겠습니까?", { exact: true }),
        ).toBeVisible();
        await mutationDialog.getByRole("button", { name: "삭제", exact: true }).click();
        await expect(mutationDialog).toHaveCount(0);

        for (const messageLog of [ownerMessageLog, memberMessageLog]) {
          const tombstone = messageLog.locator(`li[data-client-message-id="${clientMessageId!}"]`);
          await expect(tombstone.getByText("삭제된 메시지입니다.", { exact: true })).toBeVisible();
          await expect(tombstone.locator("[data-unread-count]")).toHaveCount(0);
        }

        return clientMessageId!;
      });

    await test.step("실시간 연결 복구 후 REST Receipt snapshot으로 안 읽은 인원을 복원한다", async () => {
      await sendMessage(ownerPage, topologyMessage);
      await expectConfirmedMessage(ownerMessageLog, topologyMessage);
      await expectConfirmedMessage(memberMessageLog, topologyMessage);
      const topologyRow = getMessageRow(ownerMessageLog, topologyMessage);
      await expectUnreadCount(topologyRow, 1);

      await setSharedWorkerOffline(browserSession, ownerWorkerSessionId!, true);
      await expect(ownerPage.getByText(RECONNECTING_LABEL, { exact: true })).toBeVisible();

      const recoveredSnapshot = waitForReceiptState(ownerPage, roomId, 30_000);
      await setSharedWorkerOffline(browserSession, ownerWorkerSessionId!, false);
      const snapshotResponse = await recoveredSnapshot;

      expect(
        snapshotResponse.ok(),
        `Receipt 복구 조회가 성공해야 합니다: ${snapshotResponse.status()}`,
      ).toBe(true);
      await expect(ownerPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expectUnreadCount(topologyRow, 1);
      await expect(
        getMessageRow(ownerMessageLog, ownerMessage).locator("[data-unread-count]"),
      ).toHaveCount(0);
      await expect(
        ownerMessageLog
          .locator(`li[data-client-message-id="${deletedClientMessageId}"]`)
          .locator("[data-unread-count]"),
      ).toHaveCount(0);
    });

    await test.step("안 읽은 ACTIVE 참여자가 퇴장하면 snapshot을 다시 받아 안 읽은 인원을 재계산한다", async () => {
      const topologyRow = getMessageRow(ownerMessageLog, topologyMessage);
      const topologySnapshot = waitForReceiptState(ownerPage, roomId);
      const leaveResponse = await memberPage.request.post(
        chatApiUrl(`/rooms/${roomId}/commands/leave`),
        {
          headers: { "Idempotency-Key": crypto.randomUUID() },
        },
      );
      expect(
        leaveResponse.ok(),
        `참여자 퇴장이 성공해야 합니다: ${leaveResponse.status()} ${await leaveResponse.text()}`,
      ).toBe(true);
      await expectActiveMembershipPositions(await topologySnapshot, 1);
      await expect(topologyRow.locator("[data-unread-count]")).toHaveCount(0);
    });
  } finally {
    if (ownerWorkerSessionId) {
      await setSharedWorkerOffline(browserSession, ownerWorkerSessionId, false).catch(() => {});
    }

    await Promise.all([closeContext(ownerContext), closeContext(memberContext)]);
    await browserSession.detach();
  }
});

function getMessageRow(messageLog: Locator, content: string): Locator {
  return messageLog.locator("li").filter({ hasText: content });
}

async function expectUnreadCount(row: Locator, count: number): Promise<void> {
  const unreadCount = row.locator(`[data-unread-count="${count}"]`);
  await expect(unreadCount).toHaveText(String(count));
  await expect(unreadCount).toHaveAccessibleName(`${count}명 안 읽음`);
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

function waitForReceiptState(page: Page, roomId: string, timeout?: number) {
  return page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === `/api/v1/rooms/${roomId}/read-receipts/state`
      );
    },
    timeout === undefined ? undefined : { timeout },
  );
}

async function expectActiveMembershipPositions(
  response: APIResponse,
  expectedCount: number,
): Promise<void> {
  expect(response.ok(), `Receipt snapshot 조회가 성공해야 합니다: ${response.status()}`).toBe(true);
  const body = (await response.json()) as { positions?: unknown };
  expect(Array.isArray(body.positions) ? body.positions : []).toHaveLength(expectedCount);
}

async function closeContext(context: BrowserContext): Promise<void> {
  await context.close().catch(() => {});
}

function chatApiUrl(path: string): string {
  return new URL(`/api/v1${path}`, CHAT_RESOURCE_SERVER_URL).toString();
}
