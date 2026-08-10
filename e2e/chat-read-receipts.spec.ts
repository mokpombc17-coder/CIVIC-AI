import {
  expect,
  test,
  type APIResponse,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  authenticateDevUserAs,
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

test("두 사용자의 read cursor로 메시지 읽은 인원을 표시하고 snapshot으로 복구한다", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const roomName = `e2e-read-receipt-${uniqueId}`;
  const ownerMessage = `방장 Read Receipt ${uniqueId}`;
  const memberMessage = `참여자 Read Receipt ${uniqueId}`;
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
    await authenticateDevUserAs(ownerPage, ownerContext, `e2e-receipt-owner-${uniqueId}`);
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

    await authenticateDevUserAs(memberPage, memberContext, `e2e-receipt-member-${uniqueId}`);
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

    await test.step("읽기 전에는 0명 문구를 표시하지 않고 cursor 전진 뒤 1명을 표시한다", async () => {
      await setDocumentFocusState(memberPage, false);
      await ownerPage.bringToFront();
      await setDocumentFocusState(ownerPage, true);

      await sendMessage(ownerPage, ownerMessage);
      await expectConfirmedMessage(ownerMessageLog, ownerMessage);
      await expectConfirmedMessage(memberMessageLog, ownerMessage);

      const ownerRow = getMessageRow(ownerMessageLog, ownerMessage);
      const memberRow = getMessageRow(memberMessageLog, ownerMessage);
      await expect(ownerRow.locator("[data-read-count]")).toHaveCount(0);
      await expect(memberRow.locator("[data-read-count]")).toHaveCount(0);
      await expect(ownerRow.getByText("0명 읽음", { exact: true })).toHaveCount(0);

      const memberReadStateResponse = waitForReadState(memberPage, roomId);
      await memberPage.bringToFront();
      await setDocumentFocusState(memberPage, true);
      expect((await memberReadStateResponse).ok()).toBe(true);

      await expect(ownerRow.locator('[data-read-count="1"]')).toHaveText("1명 읽음");
      await expect(memberRow.locator('[data-read-count="1"]')).toHaveText("1명 읽음");
    });

    await test.step("다른 참여자가 작성한 메시지도 상대방이 읽으면 1명을 표시한다", async () => {
      await setDocumentFocusState(ownerPage, false);
      await memberPage.bringToFront();
      await setDocumentFocusState(memberPage, true);

      await sendMessage(memberPage, memberMessage);
      await expectConfirmedMessage(ownerMessageLog, memberMessage);
      await expectConfirmedMessage(memberMessageLog, memberMessage);

      const ownerRow = getMessageRow(ownerMessageLog, memberMessage);
      const memberRow = getMessageRow(memberMessageLog, memberMessage);
      await expect(ownerRow.locator("[data-read-count]")).toHaveCount(0);
      await expect(memberRow.locator("[data-read-count]")).toHaveCount(0);

      const ownerReadStateResponse = waitForReadState(ownerPage, roomId);
      await ownerPage.bringToFront();
      await setDocumentFocusState(ownerPage, true);
      expect((await ownerReadStateResponse).ok()).toBe(true);

      await expect(ownerRow.locator('[data-read-count="1"]')).toHaveText("1명 읽음");
      await expect(memberRow.locator('[data-read-count="1"]')).toHaveText("1명 읽음");
    });

    const deletedClientMessageId =
      await test.step("삭제 tombstone에서는 기존 Read Receipt를 숨긴다", async () => {
        const ownerRow = getMessageRow(ownerMessageLog, ownerMessage);
        const clientMessageId = await ownerRow.getAttribute("data-client-message-id");
        expect(clientMessageId).not.toBeNull();

        await ownerRow.getByRole("button", { name: ownerMessage, exact: true }).click();
        const mutationDialog = ownerPage.getByRole("dialog", { name: "메시지 작업" });
        await mutationDialog.getByRole("button", { name: "삭제", exact: true }).click();
        await expect(
          mutationDialog.getByText("이 메시지를 삭제할까요?", { exact: true }),
        ).toBeVisible();
        await mutationDialog.getByRole("button", { name: "삭제", exact: true }).click();
        await expect(mutationDialog).toHaveCount(0);

        for (const messageLog of [ownerMessageLog, memberMessageLog]) {
          const tombstone = messageLog.locator(`li[data-client-message-id="${clientMessageId!}"]`);
          await expect(tombstone.getByText("삭제된 메시지입니다.", { exact: true })).toBeVisible();
          await expect(tombstone.locator("[data-read-count]")).toHaveCount(0);
        }

        return clientMessageId!;
      });

    await test.step("실시간 연결 복구 후 REST Receipt snapshot으로 count를 복원한다", async () => {
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
      await expect(
        getMessageRow(ownerMessageLog, memberMessage).locator('[data-read-count="1"]'),
      ).toHaveText("1명 읽음");
      await expect(
        ownerMessageLog
          .locator(`li[data-client-message-id="${deletedClientMessageId}"]`)
          .locator("[data-read-count]"),
      ).toHaveCount(0);
    });

    await test.step("ACTIVE 참여자 퇴장 후 snapshot을 다시 받아 기존 count를 재계산한다", async () => {
      await setDocumentFocusState(memberPage, false);
      await ownerPage.bringToFront();
      await setDocumentFocusState(ownerPage, true);
      await sendMessage(ownerPage, topologyMessage);
      await expectConfirmedMessage(ownerMessageLog, topologyMessage);
      await expectConfirmedMessage(memberMessageLog, topologyMessage);

      const memberReadStateResponse = waitForReadState(memberPage, roomId);
      await memberPage.bringToFront();
      await setDocumentFocusState(memberPage, true);
      expect((await memberReadStateResponse).ok()).toBe(true);

      const topologyRow = getMessageRow(ownerMessageLog, topologyMessage);
      await expect(topologyRow.locator('[data-read-count="1"]')).toHaveText("1명 읽음");

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
      await expect(topologyRow.locator("[data-read-count]")).toHaveCount(0);
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
