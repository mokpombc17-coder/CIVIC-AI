import { expect, test } from "@playwright/test";
import {
  authenticateLocalE2EUserAs,
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

test("네트워크 단절 중 누락된 메시지를 afterSequence로 재연결 복구한다", async ({
  browser,
}, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const roomName = `e2e-reconnect-${uniqueId}`;
  const ownerSubject = `e2e-reconnect-owner-${uniqueId}`;
  const memberSubject = `e2e-reconnect-member-${uniqueId}`;
  const baselineMessage = `단절 전 메시지 ${uniqueId}`;
  const firstMissedMessage = `단절 중 첫 메시지 ${uniqueId}`;
  const secondMissedMessage = `단절 중 둘째 메시지 ${uniqueId}`;
  const browserSession = await browser.newBrowserCDPSession();
  const existingSharedWorkerTargetIds = new Set(
    (await browserSession.send("Target.getTargets")).targetInfos
      .filter((target) => target.type === "shared_worker")
      .map((target) => target.targetId),
  );
  const ownerContext = await browser.newContext({ baseURL });
  const memberContext = await browser.newContext({ baseURL });
  const ownerPage = await ownerContext.newPage();
  let ownerWorkerSessionId: string | null = null;

  try {
    await test.step("방장 사용자로 로그인한다", async () => {
      await authenticateLocalE2EUserAs(ownerPage, ownerContext, ownerSubject);
    });

    const roomId =
      await test.step("방장의 실시간 구독과 SharedWorker target을 확인한다", async () => {
        const createdRoomId = await createRoomAndEnter(ownerPage, roomName);

        await expect(ownerPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
        const targetId = await findNewSharedWorkerTargetId(
          browserSession,
          existingSharedWorkerTargetIds,
        );
        const attachedTarget = await browserSession.send("Target.attachToTarget", {
          targetId,
          flatten: false,
        });

        ownerWorkerSessionId = attachedTarget.sessionId;
        await enableSharedWorkerNetwork(browserSession, ownerWorkerSessionId);

        return createdRoomId;
      });

    const memberPage = await memberContext.newPage();
    await test.step("다른 플랫폼 사용자가 같은 공개 방에 참여한다", async () => {
      await authenticateLocalE2EUserAs(memberPage, memberContext, memberSubject);
      await joinPublicRoomAndEnter(memberPage, roomId, roomName);
      await expect(memberPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
    });

    const ownerMessageLog = ownerPage.getByRole("log", { name: `${roomId} 메시지` });
    const memberMessageLog = memberPage.getByRole("log", { name: `${roomId} 메시지` });

    await test.step("단절 전에 연속 적용 기준이 될 첫 메시지를 양쪽에서 수신한다", async () => {
      await memberPage.getByRole("textbox", { name: "메시지" }).fill(baselineMessage);
      await memberPage.getByRole("button", { name: "전송", exact: true }).click();

      await expect(memberMessageLog.getByText(baselineMessage, { exact: true })).toBeVisible();
      await expect(ownerMessageLog.getByText(baselineMessage, { exact: true })).toBeVisible();
    });

    await test.step("방장 브라우저의 네트워크를 끊는다", async () => {
      await setSharedWorkerOffline(browserSession, ownerWorkerSessionId!, true);

      await expect(ownerPage.getByText(RECONNECTING_LABEL, { exact: true })).toBeVisible();
    });

    await test.step("단절 중 다른 사용자가 메시지를 생성한다", async () => {
      await memberPage.getByRole("textbox", { name: "메시지" }).fill(firstMissedMessage);
      await memberPage.getByRole("button", { name: "전송", exact: true }).click();
      await expect(memberMessageLog.getByText(firstMissedMessage, { exact: true })).toBeVisible();

      await memberPage.getByRole("textbox", { name: "메시지" }).fill(secondMissedMessage);
      await memberPage.getByRole("button", { name: "전송", exact: true }).click();
      await expect(memberMessageLog.getByText(secondMissedMessage, { exact: true })).toBeVisible();

      await expect(ownerMessageLog.getByText(firstMissedMessage, { exact: true })).toHaveCount(0);
      await expect(ownerMessageLog.getByText(secondMissedMessage, { exact: true })).toHaveCount(0);
    });

    await test.step("온라인 복귀 후 마지막 연속 sequence 다음부터 REST로 복구한다", async () => {
      const recoveryResponse = ownerPage.waitForResponse(
        (response) => {
          const url = new URL(response.url());

          return (
            response.request().method() === "GET" &&
            url.pathname === `/api/v1/rooms/${roomId}/messages` &&
            url.searchParams.has("afterSequence")
          );
        },
        { timeout: 30_000 },
      );

      await setSharedWorkerOffline(browserSession, ownerWorkerSessionId!, false);

      const response = await recoveryResponse;
      const requestUrl = new URL(response.url());

      expect(response.ok(), `재연결 메시지 복구가 성공해야 합니다: ${response.status()}`).toBe(
        true,
      );
      expect(requestUrl.searchParams.get("afterSequence")).toBe("1");
      await expect(ownerPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(ownerMessageLog.getByText(firstMissedMessage, { exact: true })).toBeVisible();
      await expect(ownerMessageLog.getByText(secondMissedMessage, { exact: true })).toBeVisible();
      // 입장 안내 같은 system activity 행은 빼고 복구한 메시지가 중복 없이 붙었는지 확인함
      await expect(ownerMessageLog.locator("li[data-client-message-id]")).toHaveCount(3);
    });
  } finally {
    if (ownerWorkerSessionId) {
      await setSharedWorkerOffline(browserSession, ownerWorkerSessionId, false).catch(() => {});
    }

    await Promise.all([ownerContext.close(), memberContext.close()]);
    await browserSession.detach();
  }
});
