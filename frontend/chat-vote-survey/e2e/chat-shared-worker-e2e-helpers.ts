import { expect, type CDPSession } from "@playwright/test";

export async function findNewSharedWorkerTargetId(
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

export async function enableSharedWorkerNetwork(
  browserSession: CDPSession,
  sessionId: string,
): Promise<void> {
  await sendTargetCommand(browserSession, sessionId, "Network.enable");
}

export async function setSharedWorkerOffline(
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

export async function closeSharedWorkerWebSockets(
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
