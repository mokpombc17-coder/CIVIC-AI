import { expect, test, type CDPSession } from "@playwright/test";
import {
  authenticateDevUserAs,
  createRoomAndEnter,
  joinPublicRoomAndEnter,
} from "./chat-e2e-helpers";

const ACTIVE_ROOM_LABEL = "이 탭에서 실시간 채팅을 사용 중입니다.";
const CONNECTED_LABEL = "실시간 연결: 연결됨";
const RECONNECTING_LABEL = "실시간 연결: 재연결 중";

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
      await authenticateDevUserAs(ownerPage, ownerContext, ownerSubject);
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
        await sendTargetCommand(browserSession, ownerWorkerSessionId, "Network.enable");

        return createdRoomId;
      });

    const memberPage = await memberContext.newPage();
    await test.step("다른 플랫폼 사용자가 같은 공개 방에 참여한다", async () => {
      await authenticateDevUserAs(memberPage, memberContext, memberSubject);
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
      await expect(ownerPage.getByText(CONNECTED_LABEL, { exact: true })).toBeVisible();
      await expect(ownerPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(ownerMessageLog.getByText(firstMissedMessage, { exact: true })).toBeVisible();
      await expect(ownerMessageLog.getByText(secondMissedMessage, { exact: true })).toBeVisible();
      await expect(ownerMessageLog.getByRole("listitem")).toHaveCount(3);
    });
  } finally {
    if (ownerWorkerSessionId) {
      await setSharedWorkerOffline(browserSession, ownerWorkerSessionId, false).catch(() => {});
    }

    await Promise.all([ownerContext.close(), memberContext.close()]);
    await browserSession.detach();
  }
});

async function findNewSharedWorkerTargetId(
  browserSession: CDPSession,
  existingTargetIds: ReadonlySet<string>,
): Promise<string> {
  let targetId: string | null = null;

  await expect
    .poll(async () => {
      const targets = await browserSession.send("Target.getTargets");
      const target = targets.targetInfos.find(
        (candidate) =>
          candidate.type === "shared_worker" && !existingTargetIds.has(candidate.targetId),
      );

      targetId = target?.targetId ?? null;
      return targetId;
    })
    .not.toBeNull();

  return targetId!;
}

let targetCommandId = 0;

async function setSharedWorkerOffline(
  browserSession: CDPSession,
  sessionId: string,
  offline: boolean,
): Promise<void> {
  await sendTargetCommand(browserSession, sessionId, "Network.emulateNetworkConditions", {
    offline,
    latency: 0,
    downloadThroughput: offline ? 0 : -1,
    uploadThroughput: offline ? 0 : -1,
  });

  if (offline) {
    await closeSharedWorkerWebSockets(browserSession, sessionId);
  }
}

async function closeSharedWorkerWebSockets(
  browserSession: CDPSession,
  sessionId: string,
): Promise<void> {
  const prototype = await sendTargetCommand<{
    result: {
      objectId?: string;
    };
  }>(browserSession, sessionId, "Runtime.evaluate", {
    expression: "WebSocket.prototype",
  });
  const prototypeObjectId = prototype.result.objectId;

  if (!prototypeObjectId) {
    throw new Error("SharedWorker에서 WebSocket prototype을 찾지 못했습니다.");
  }

  const sockets = await sendTargetCommand<{
    objects: {
      objectId?: string;
    };
  }>(browserSession, sessionId, "Runtime.queryObjects", {
    prototypeObjectId,
  });
  const socketsObjectId = sockets.objects.objectId;

  if (!socketsObjectId) {
    throw new Error("SharedWorker에서 활성 WebSocket 목록을 찾지 못했습니다.");
  }

  const closeResult = await sendTargetCommand<{
    result: {
      value?: {
        activeSocketCount: number;
        closeHandlerCount: number;
        socketCount: number;
      };
    };
  }>(browserSession, sessionId, "Runtime.callFunctionOn", {
    objectId: socketsObjectId,
    returnByValue: true,
    functionDeclaration: `function () {
      let activeSocketCount = 0;
      let closeHandlerCount = 0;

      for (const socket of this) {
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
          activeSocketCount += 1;
          const handleClose = socket.onclose;

          if (typeof handleClose === "function") {
            closeHandlerCount += 1;
          }

          socket.onmessage = null;
          socket.onerror = null;
          socket.onclose = null;
          socket.close(3001, "NETWORK_DISCONNECTED");

          if (typeof handleClose === "function") {
            handleClose.call(
              socket,
              new CloseEvent("close", {
                code: 1006,
                reason: "NETWORK_DISCONNECTED",
                wasClean: false,
              }),
            );
          }
        }
      }

      return {
        activeSocketCount,
        closeHandlerCount,
        socketCount: this.length,
      };
    }`,
  });
  const counts = closeResult.result.value;

  if (!counts || counts.activeSocketCount === 0 || counts.closeHandlerCount === 0) {
    throw new Error(
      `SharedWorker WebSocket fault injection에 실패했습니다: ${JSON.stringify(closeResult)}`,
    );
  }
}

async function sendTargetCommand<TResult = Record<string, never>>(
  browserSession: CDPSession,
  sessionId: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<TResult> {
  targetCommandId += 1;
  const commandId = targetCommandId;

  return new Promise<TResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      browserSession.off("Target.receivedMessageFromTarget", handleTargetMessage);
      reject(new Error(`${method} SharedWorker CDP 명령 응답 시간이 초과되었습니다.`));
    }, 10_000);

    const handleTargetMessage = (event: { message: string; sessionId: string }) => {
      if (event.sessionId !== sessionId) {
        return;
      }

      const response = JSON.parse(event.message) as {
        error?: {
          message: string;
        };
        id?: number;
        result?: TResult;
      };

      if (response.id !== commandId) {
        return;
      }

      clearTimeout(timeout);
      browserSession.off("Target.receivedMessageFromTarget", handleTargetMessage);

      if (response.error) {
        reject(
          new Error(`${method} SharedWorker CDP 명령이 실패했습니다: ${response.error.message}`),
        );
        return;
      }

      resolve(response.result ?? ({} as TResult));
    };

    browserSession.on("Target.receivedMessageFromTarget", handleTargetMessage);
    void browserSession
      .send("Target.sendMessageToTarget", {
        sessionId,
        message: JSON.stringify({
          id: commandId,
          method,
          params,
        }),
      })
      .catch((error: unknown) => {
        clearTimeout(timeout);
        browserSession.off("Target.receivedMessageFromTarget", handleTargetMessage);
        reject(error);
      });
  });
}
