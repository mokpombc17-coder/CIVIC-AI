import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";
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
const RECONNECT_ATTEMPT_WAIT_MS = 5_000;
const MESSAGE_COUNT = 52;

test("최신 이력 밖의 검색 결과와 실패한 과거 이력 조회를 viewport에서 복구한다", async ({
  browser,
  context,
  page,
}, testInfo) => {
  test.setTimeout(300_000);

  const uniqueId = crypto.randomUUID();
  const roomName = `e2e-viewport-history-${uniqueId}`;
  const searchQuery = `오래된표적-${uniqueId.slice(0, 8)}`;
  const messages = Array.from({ length: MESSAGE_COUNT }, (_, index) =>
    index === 0
      ? `${searchQuery} 첫 메시지`
      : // 50자를 넘으면 전송 rate limit 비용이 2배라 1.1초 간격 전송이 한도에 걸림
        `vh-${String(index + 1).padStart(2, "0")}-${uniqueId.slice(0, 8)}`,
  );

  // 다른 참여자가 검색 대상 바로 뒤에 남겨 이동한 대화 안에 들어오는 메시지. 연결이 끊긴 동안 수정·삭제함
  const memberEditMessage = `vh-member-edit-${uniqueId.slice(0, 8)}`;
  const memberEditedMessage = `vh-member-edited-${uniqueId.slice(0, 8)}`;
  const memberDeleteMessage = `vh-member-delete-${uniqueId.slice(0, 8)}`;

  await authenticateLocalE2EUserAs(page, context, `e2e-viewport-history-${uniqueId}`);
  const roomId = await createRoomAndEnter(page, roomName);
  const messageLog = page.getByRole("log", { name: `${roomId} 메시지` });
  const messageInput = page.getByRole("textbox", { name: "메시지" });
  const memberContext = await browser.newContext({
    baseURL: String(testInfo.project.use.baseURL),
  });
  const memberPage = await memberContext.newPage();

  try {
    await expect(page.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
    await expect(messageInput).toBeEnabled();

    await test.step("최신 이력 한 페이지를 넘도록 실제 STOMP 메시지를 생성한다", async () => {
      await sendAndConfirm(page, messageLog, messages[0]!);

      await authenticateLocalE2EUserAs(
        memberPage,
        memberContext,
        `e2e-viewport-history-member-${uniqueId}`,
      );
      await joinPublicRoomAndEnter(memberPage, roomId, roomName);
      const memberMessageLog = memberPage.getByRole("log", { name: `${roomId} 메시지` });
      await sendAndConfirm(memberPage, memberMessageLog, memberEditMessage);
      await sendAndConfirm(memberPage, memberMessageLog, memberDeleteMessage);

      for (const message of messages.slice(1)) {
        await sendAndConfirm(page, messageLog, message);
      }
    });

    const messageSearchBox = page
      .locator('[data-chat-room-message-search-panel="true"]')
      .getByRole("search")
      .getByRole("searchbox", { name: "메시지 내용" });
    const openOldSearchResult = async () => {
      await reloadToLatestHistory(page, roomId, messageInput);
      await expect(messageLog.getByText(messages[0]!, { exact: true })).toHaveCount(0);

      await page.getByRole("button", { name: "메시지 검색", exact: true }).click();
      const searchInput = page
        .locator('[data-chat-room-message-search-panel="true"]')
        .getByRole("search")
        .getByRole("searchbox", { name: "메시지 내용" });
      await searchInput.fill(searchQuery);
      await searchInput.press("Enter");

      const targetRow = messageLog.locator('[data-navigation-target="true"]');
      await expect(targetRow).toContainText(messages[0]!);
      await expect.poll(() => isElementFullyVisible(messageLog, targetRow)).toBe(true);
    };

    await test.step("최신 이력 밖의 검색 결과로 이동하면 대상 메시지를 viewport 안에 표시한다", async () => {
      await openOldSearchResult();
      await expect(messageLog.getByText(messages.at(-1)!, { exact: true })).toHaveCount(0);
    });

    await test.step("최신 대화로 이동하면 원래 timeline의 최신 메시지로 돌아간다", async () => {
      const navigateToLatest = page.getByRole("button", { name: "최신 대화로 이동", exact: true });
      await expect(navigateToLatest).toBeVisible();

      await navigateToLatest.click();

      await expect(navigateToLatest).toHaveCount(0);
      await expect(messageLog.getByText(messages.at(-1)!, { exact: true })).toBeVisible();
      await expect.poll(() => isMessageFullyVisible(messageLog, messages.at(-1)!)).toBe(true);
      await expect(messageLog.getByText(messages[0]!, { exact: true })).toHaveCount(0);
    });

    await test.step("검색 결과 구간에서 최신까지 불러오면 보던 위치 그대로 실시간 목록으로 합친다", async () => {
      await openOldSearchResult();
      const isNewerHistoryRequest = (url: URL) =>
        url.pathname === `/api/v1/rooms/${roomId}/messages` &&
        url.searchParams.has("afterSequence");
      const failNewerHistory = (route: Route) =>
        route.fulfill({
          body: JSON.stringify({
            status: 500,
            title: "Internal Server Error",
            type: "about:blank",
          }),
          contentType: "application/problem+json",
          status: 500,
        });
      await page.route(isNewerHistoryRequest, failNewerHistory);

      await expect(messageLog.getByText(messages.at(-1)!, { exact: true })).toHaveCount(0);
      await scrollToBottomAsUser(messageLog);

      // 불러오기에 실패해도 오류 화면으로 바뀌지 않고 목록 아래에 다시 시도 버튼만 떠야 함
      const newerError = page.locator('[data-chat-message-history-state="newer-error"]');
      await expect(newerError).toBeVisible({ timeout: 30_000 });
      await expect(newerError).toContainText("다음 메시지를 불러오지 못했습니다.");
      await expect(page.getByText("대화 위치로 이동하지 못했습니다.", { exact: true })).toHaveCount(
        0,
      );

      // 실패한 뒤에는 맨 아래에서 다시 스크롤해도 다시 시도 버튼을 누르기 전까지 요청하지 않아야 함
      await expectNoHistoryRequestWhile(page, isNewerHistoryRequest, async () => {
        await scrollAwayFromBottomAsUser(messageLog);
        await scrollToBottomAsUser(messageLog);
      });
      await expect(newerError).toBeVisible();

      const positionBeforeMerge = await readTopVisibleMessage(messageLog);
      await page.unroute(isNewerHistoryRequest, failNewerHistory);
      const newerHistoryResponse = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return response.request().method() === "GET" && isNewerHistoryRequest(url);
      });
      await newerError
        .getByRole("button", { name: "다음 메시지 다시 불러오기", exact: true })
        .click();

      expect(
        (await newerHistoryResponse).ok(),
        "다시 요청한 다음 페이지 조회가 성공해야 합니다.",
      ).toBe(true);
      await expect(newerError).toHaveCount(0);

      // 불러온 메시지가 아래에 붙어도 맨 아래로 끌려 내려가지 않아야 함
      await expect
        .poll(() =>
          messageLog.evaluate(
            (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
          ),
        )
        .toBeGreaterThan(96);

      // 더 불러올 메시지가 없으면 최신 대화로 돌아가고 돌아가기 전 맨 위에 있던 메시지는 같은 높이에 그대로 있어야 함
      await expect(page.getByRole("button", { name: "최신 대화로 이동", exact: true })).toHaveCount(
        0,
      );
      const positionAfterMerge = await readMessageOffset(
        messageLog,
        positionBeforeMerge.clientMessageId,
      );
      expect(positionAfterMerge).not.toBeNull();
      expect(
        Math.abs(positionAfterMerge! - positionBeforeMerge.offsetFromViewportTop),
      ).toBeLessThanOrEqual(2);

      await scrollToBottomAsUser(messageLog);
      await expect(messageLog.getByText(messages.at(-1)!, { exact: true })).toBeVisible();
    });

    await test.step("검색 결과 구간에서 연결이 끊긴 사이 다른 참여자가 수정·삭제한 메시지를 다시 연결된 뒤 반영하고 같은 높이로 복원한다", async () => {
      const browserSession = await browser.newBrowserCDPSession();
      // 새로고침하면 SharedWorker가 새로 만들어지므로 새로고침 전 target을 기억해 새 worker를 찾음
      const workerTargetIdsBeforeReload = await listSharedWorkerTargetIds(browserSession);
      await openOldSearchResult();
      const workerTargetId = await findNewSharedWorkerTargetId(
        browserSession,
        workerTargetIdsBeforeReload,
      );
      const { sessionId: workerSessionId } = await browserSession.send("Target.attachToTarget", {
        flatten: false,
        targetId: workerTargetId,
      });
      await enableSharedWorkerNetwork(browserSession, workerSessionId);

      try {
        await expect(messageLog.getByText(memberEditMessage, { exact: true })).toBeVisible();
        await expect(messageLog.getByText(memberDeleteMessage, { exact: true })).toBeVisible();
        // 검색 결과가 아닌 메시지가 맨 위에 오도록 조금 스크롤해 보던 위치와 이동 위치를 구분함
        await scrollByAsUser(messageLog, -80);
        const positionBeforeDisconnect = await readTopVisibleMessage(messageLog);

        await setSharedWorkerOffline(browserSession, workerSessionId, true);
        await expect(page.getByText(RECONNECTING_LABEL, { exact: true })).toBeVisible();

        // 자동 재연결이 실패할 때마다 연결 상태가 잠깐 오류를 거치므로 재연결 시도가 일어날 만큼 기다림
        await page.waitForTimeout(RECONNECT_ATTEMPT_WAIT_MS);
        await expect(messageSearchBox).toHaveValue(searchQuery);

        // 끊긴 동안에도 보던 대화를 닫지 않고 같은 위치에 둠
        await expect(
          page.getByRole("button", { name: "최신 대화로 이동", exact: true }),
        ).toBeVisible();
        expect(
          await readMessageOffsetDistance(messageLog, positionBeforeDisconnect),
        ).toBeLessThanOrEqual(2);

        // 끊긴 동안 다른 참여자가 자기 메시지를 수정·삭제하면 그 실시간 이벤트는 끊긴 쪽에 오지 않음
        await editAndDeleteOwnMessages(memberPage, roomId, {
          deleteMessage: memberDeleteMessage,
          editMessage: memberEditMessage,
          editedMessage: memberEditedMessage,
        });
        await expect(messageLog.getByText(memberEditMessage, { exact: true })).toBeVisible();

        const restoreResponse = page.waitForResponse(
          (response) => {
            const url = new URL(response.url());
            return response.request().method() === "GET" && isContextRequest(roomId, url);
          },
          { timeout: 30_000 },
        );
        const searchResponse = page.waitForResponse(
          (response) => {
            const url = new URL(response.url());
            return (
              response.request().method() === "POST" &&
              url.pathname === `/api/v1/rooms/${roomId}/messages/search`
            );
          },
          { timeout: 30_000 },
        );
        await setSharedWorkerOffline(browserSession, workerSessionId, false);

        // 같은 generation으로 돌아와도 실시간 복구는 실시간 목록만 다시 받으므로 이동한 대화와 검색 결과를 따로 새로 받아야 함
        expect((await restoreResponse).ok(), "보던 위치 주변 대화를 다시 받아야 합니다.").toBe(
          true,
        );
        expect((await searchResponse).ok(), "검색 결과를 다시 받아야 합니다.").toBe(true);
        await expect(page.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
        await expect(messageLog.getByText(memberEditedMessage, { exact: true })).toBeVisible();
        await expect(messageLog.getByText(memberEditMessage, { exact: true })).toHaveCount(0);
        await expect(messageLog.getByText(memberDeleteMessage, { exact: true })).toHaveCount(0);
        await expect(messageLog.getByText("삭제된 메시지입니다.", { exact: true })).toBeVisible();
        await expect
          .poll(() => readMessageOffsetDistance(messageLog, positionBeforeDisconnect))
          .toBeLessThanOrEqual(2);
        await expect(messageSearchBox).toHaveValue(searchQuery);
        await expect(messageLog.locator('[data-navigation-target="true"]')).toContainText(
          messages[0]!,
        );
      } finally {
        await setSharedWorkerOffline(browserSession, workerSessionId, false).catch(() => {});
        await browserSession.detach();
      }
    });

    await test.step("검색 결과 구간에서 다른 탭에 넘긴 사용권을 되찾으면 보던 메시지 주변을 다시 받아 같은 높이로 복원한다", async () => {
      await openOldSearchResult();
      await scrollByAsUser(messageLog, -80);
      const positionBeforeReplace = await readTopVisibleMessage(messageLog);
      const otherPage = await context.newPage();

      try {
        await otherPage.goto(page.url());
        await expect(otherPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
        const tabReplacedNotice = page.locator('[data-chat-session-notice="replaced"]');
        await expect(tabReplacedNotice).toBeVisible();

        // 사용권을 넘긴 동안에도 보던 대화와 검색을 그대로 둠
        await expect(messageSearchBox).toHaveValue(searchQuery);
        expect(
          await readMessageOffsetDistance(messageLog, positionBeforeReplace),
        ).toBeLessThanOrEqual(2);

        // 사용권을 되찾으면 연결 세대가 바뀌어 끊긴 사이 수정·삭제를 놓쳤을 수 있으므로 대화를 다시 받음
        const restoreResponse = page.waitForResponse((response) => {
          const url = new URL(response.url());
          return response.request().method() === "GET" && isContextRequest(roomId, url);
        });
        await tabReplacedNotice
          .getByRole("button", { name: "여기서 계속하기", exact: true })
          .click();

        expect((await restoreResponse).ok(), "보던 위치 주변 대화를 다시 받아야 합니다.").toBe(
          true,
        );
        await expect(page.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
        await expect
          .poll(() => readMessageOffsetDistance(messageLog, positionBeforeReplace))
          .toBeLessThanOrEqual(2);
        await expect(messageLog.locator('[data-navigation-target="true"]')).toContainText(
          messages[0]!,
        );
        await expect(
          page.getByRole("button", { name: "최신 대화로 이동", exact: true }),
        ).toBeVisible();
        // 검색은 유지하되 재연결 때 현재 결과로 자동 이동하지 않아야 위 복원 위치가 유지됨
        await expect(messageSearchBox).toHaveValue(searchQuery);
      } finally {
        await otherPage.close();
      }
    });

    await test.step("과거 이력 조회가 실패하면 안내를 표시하고 재시도로 읽던 위치를 복구한다", async () => {
      await reloadToLatestHistory(page, roomId, messageInput);

      const isOlderHistoryRequest = (url: URL) =>
        url.pathname === `/api/v1/rooms/${roomId}/messages` &&
        url.searchParams.has("beforeSequence");
      const failOlderHistory = (route: Route) =>
        route.fulfill({
          body: JSON.stringify({
            status: 500,
            title: "Internal Server Error",
            type: "about:blank",
          }),
          contentType: "application/problem+json",
          status: 500,
        });
      await page.route(isOlderHistoryRequest, failOlderHistory);

      await waitForScrollSettledAtLatest(messageLog);
      await messageLog.evaluate((element) => element.scrollTo({ top: 0 }));

      const olderError = page.locator('[data-chat-message-history-state="older-error"]');
      await expect(olderError).toBeVisible({ timeout: 30_000 });
      await expect(olderError).toContainText("이전 메시지를 불러오지 못했습니다.");
      await expect(messageLog.getByText(messages[0]!, { exact: true })).toHaveCount(0);

      // 실패한 뒤에는 맨 위에서 다시 스크롤해도 다시 시도 버튼을 누르기 전까지 요청하지 않아야 함
      await expectNoHistoryRequestWhile(page, isOlderHistoryRequest, async () => {
        await messageLog.evaluate((element) => element.scrollTo({ top: 200 }));
        await messageLog.evaluate((element) => element.scrollTo({ top: 0 }));
      });
      await expect(olderError).toBeVisible();

      await page.unroute(isOlderHistoryRequest, failOlderHistory);
      const previousHistoryResponse = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === "GET" &&
          url.pathname === `/api/v1/rooms/${roomId}/messages` &&
          url.searchParams.has("beforeSequence")
        );
      });

      await olderError
        .getByRole("button", { name: "이전 메시지 다시 불러오기", exact: true })
        .click();

      expect(
        (await previousHistoryResponse).ok(),
        "재시도한 과거 이력 조회가 성공해야 합니다.",
      ).toBe(true);
      await expect(olderError).toHaveCount(0);
      await expect(messageLog.getByText(messages[2]!, { exact: true })).toBeVisible();
      await expect
        .poll(() => messageLog.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
    });

    await test.step("검색 결과 구간에서 메시지를 보내면 최신으로 이동해 보낸 메시지를 보여 준다", async () => {
      await openOldSearchResult();
      const sentMessage = `vh-sent-${uniqueId.slice(0, 8)}`;

      await messageInput.fill(sentMessage);
      await page.getByRole("button", { name: "전송", exact: true }).click();

      await expect(page.getByRole("button", { name: "최신 대화로 이동", exact: true })).toHaveCount(
        0,
      );
      await expect(messageLog.getByText(sentMessage, { exact: true })).toBeVisible();
      await expect.poll(() => isMessageFullyVisible(messageLog, sentMessage)).toBe(true);
    });
  } finally {
    await memberContext.close();
  }
});

async function sendAndConfirm(page: Page, messageLog: Locator, message: string) {
  await page.getByRole("textbox", { name: "메시지" }).fill(message);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect(messageLog.getByText(message, { exact: true })).toBeVisible();
  // 50자를 넘으면 전송 rate limit 비용이 2배라 1.1초 간격 전송이 한도에 걸림
  await page.waitForTimeout(1_100);
}

// 참여자의 메시지는 최신 이력 밖에 있으므로 검색으로 그 위치를 연 뒤 수정하고 바로 옆 메시지를 삭제함
async function editAndDeleteOwnMessages(
  page: Page,
  roomId: string,
  {
    deleteMessage,
    editMessage,
    editedMessage,
  }: Readonly<{ deleteMessage: string; editMessage: string; editedMessage: string }>,
) {
  const messageLog = page.getByRole("log", { name: `${roomId} 메시지` });
  await page.getByRole("button", { name: "메시지 검색", exact: true }).click();
  const searchBox = page
    .locator('[data-chat-room-message-search-panel="true"]')
    .getByRole("search")
    .getByRole("searchbox", { name: "메시지 내용" });
  await searchBox.fill(editMessage);
  await searchBox.press("Enter");
  await expect(messageLog.locator('[data-navigation-target="true"]')).toContainText(editMessage);

  const mutationDialog = page.getByRole("dialog", { name: /^메시지( 수정| 삭제)?$/ });
  await messageLog.getByRole("button", { name: editMessage, exact: true }).click();
  await mutationDialog.getByRole("button", { name: "수정", exact: true }).click();
  await mutationDialog.getByRole("textbox", { name: "선택한 메시지" }).fill(editedMessage);
  await mutationDialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(mutationDialog).toHaveCount(0);
  await expect(messageLog.getByText(editedMessage, { exact: true })).toBeVisible();

  await messageLog.getByRole("button", { name: deleteMessage, exact: true }).click();
  await mutationDialog.getByRole("button", { name: "삭제", exact: true }).click();
  await mutationDialog.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(mutationDialog).toHaveCount(0);
  await expect(messageLog.getByText(deleteMessage, { exact: true })).toHaveCount(0);
}

async function reloadToLatestHistory(page: Page, roomId: string, messageInput: Locator) {
  const latestHistoryResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname === `/api/v1/rooms/${roomId}/messages` &&
      !url.searchParams.has("beforeSequence") &&
      !url.searchParams.has("afterSequence")
    );
  });

  await page.reload();

  expect((await latestHistoryResponse).ok(), "최신 메시지 이력 조회가 성공해야 합니다.").toBe(true);
  await expect(page.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
  await expect(messageInput).toBeEnabled();
}

// 진입 직후 최신 위치 보정이 몇 frame 동안 scroll을 맨 아래로 다시 맞추므로 보정이 끝난 뒤 scroll을 움직임
async function waitForScrollSettledAtLatest(messageLog: Locator) {
  await expect
    .poll(() =>
      messageLog.evaluate(
        (element) =>
          new Promise<boolean>((resolve) => {
            const initialScrollTop = element.scrollTop;
            let remainingFrames = 10;
            const check = () => {
              if (element.scrollTop !== initialScrollTop) {
                resolve(false);
                return;
              }
              remainingFrames -= 1;
              if (remainingFrames === 0) {
                resolve(element.scrollHeight - element.scrollTop - element.clientHeight <= 1);
                return;
              }
              requestAnimationFrame(check);
            };
            requestAnimationFrame(check);
          }),
      ),
    )
    .toBe(true);
}

function isContextRequest(roomId: string, url: URL): boolean {
  return (
    url.pathname.startsWith(`/api/v1/rooms/${roomId}/messages/`) &&
    url.pathname.endsWith("/context")
  );
}

async function readMessageOffsetDistance(
  messageLog: Locator,
  position: Readonly<{ clientMessageId: string; offsetFromViewportTop: number }>,
): Promise<number> {
  const offset = await readMessageOffset(messageLog, position.clientMessageId);
  return offset === null
    ? Number.POSITIVE_INFINITY
    : Math.abs(offset - position.offsetFromViewportTop);
}

async function listSharedWorkerTargetIds(browserSession: CDPSession): Promise<Set<string>> {
  const { targetInfos } = await browserSession.send("Target.getTargets");
  return new Set(
    targetInfos
      .filter((target) => target.type === "shared_worker")
      .map((target) => target.targetId),
  );
}

async function scrollByAsUser(messageLog: Locator, deltaY: number) {
  await messageLog.evaluate(
    (element, delta) =>
      new Promise<void>((resolve) => {
        element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: delta }));
        element.scrollBy({ top: delta });
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
    deltaY,
  );
}

async function scrollAwayFromBottomAsUser(messageLog: Locator) {
  await messageLog.evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -120 }));
        element.scrollTo({ top: element.scrollHeight - element.clientHeight - 200 });
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

// 요청이 없다는 것은 기다려 봐야만 알 수 있어서 동작 뒤 잠시 기다린 다음 그사이 요청 수를 확인함
async function expectNoHistoryRequestWhile(
  page: Page,
  isHistoryRequest: (url: URL) => boolean,
  action: () => Promise<void>,
) {
  let requestCount = 0;
  const countHistoryRequest = (request: { method(): string; url(): string }) => {
    if (request.method() === "GET" && isHistoryRequest(new URL(request.url()))) {
      requestCount += 1;
    }
  };

  page.on("request", countHistoryRequest);
  try {
    await action();
    await page.waitForTimeout(1_000);
  } finally {
    page.off("request", countHistoryRequest);
  }

  expect(requestCount, "실패한 뒤 스크롤만으로는 다시 요청하지 않아야 합니다.").toBe(0);
}

async function scrollToBottomAsUser(messageLog: Locator) {
  await messageLog.evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 120 }));
        element.scrollTo({ top: element.scrollHeight });
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function readTopVisibleMessage(
  messageLog: Locator,
): Promise<{ clientMessageId: string; offsetFromViewportTop: number }> {
  const position = await messageLog.evaluate((element) => {
    const viewportTop = element.getBoundingClientRect().top;
    const row = [...element.querySelectorAll<HTMLElement>("li[data-client-message-id]")]
      .filter((candidate) => candidate.getBoundingClientRect().bottom > viewportTop)
      .sort(
        (left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top,
      )[0];

    return row?.dataset.clientMessageId
      ? {
          clientMessageId: row.dataset.clientMessageId,
          offsetFromViewportTop: row.getBoundingClientRect().top - viewportTop,
        }
      : null;
  });

  expect(position, "화면 맨 위 메시지를 찾아야 합니다.").not.toBeNull();
  return position!;
}

async function readMessageOffset(messageLog: Locator, clientMessageId: string) {
  return messageLog.evaluate((element, id) => {
    const row = element.querySelector<HTMLElement>(`li[data-client-message-id="${id}"]`);
    return row ? row.getBoundingClientRect().top - element.getBoundingClientRect().top : null;
  }, clientMessageId);
}

async function isMessageFullyVisible(messageLog: Locator, messageText: string): Promise<boolean> {
  return messageLog.evaluate((element, text) => {
    const viewportBounds = element.getBoundingClientRect();
    const message = [...element.querySelectorAll<HTMLElement>("li[data-client-message-id]")].find(
      (candidate) => candidate.textContent?.includes(text),
    );

    if (!message) {
      return false;
    }

    const messageBounds = message.getBoundingClientRect();
    return messageBounds.top >= viewportBounds.top && messageBounds.bottom <= viewportBounds.bottom;
  }, messageText);
}

async function isElementFullyVisible(messageLog: Locator, target: Locator): Promise<boolean> {
  const [viewportBounds, targetBounds] = await Promise.all([
    messageLog.boundingBox(),
    target.boundingBox(),
  ]);

  if (!viewportBounds || !targetBounds) {
    return false;
  }

  return (
    targetBounds.y >= viewportBounds.y &&
    targetBounds.y + targetBounds.height <= viewportBounds.y + viewportBounds.height
  );
}
