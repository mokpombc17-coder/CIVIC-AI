import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { authenticateLocalE2EUserAs, createRoomAndEnter } from "./chat-e2e-helpers";

const ACTIVE_ROOM_LABEL = "채팅 가능";
const MESSAGE_COUNT = 52;

test("최신 이력 밖의 검색 결과와 실패한 과거 이력 조회를 viewport에서 복구한다", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);

  const uniqueId = crypto.randomUUID();
  const roomName = `e2e-viewport-history-${uniqueId}`;
  const searchQuery = `오래된표적-${uniqueId.slice(0, 8)}`;
  const messages = Array.from({ length: MESSAGE_COUNT }, (_, index) =>
    index === 0
      ? `${searchQuery} 첫 메시지`
      : // 50자를 넘으면 전송 rate limit 비용이 2배라 1.1초 간격 전송이 한도에 걸림
        `vh-${String(index + 1).padStart(2, "0")}-${uniqueId.slice(0, 8)}`,
  );

  await authenticateLocalE2EUserAs(page, context, `e2e-viewport-history-${uniqueId}`);
  const roomId = await createRoomAndEnter(page, roomName);
  const messageLog = page.getByRole("log", { name: `${roomId} 메시지` });
  const messageInput = page.getByRole("textbox", { name: "메시지" });

  await expect(page.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
  await expect(messageInput).toBeEnabled();

  await test.step("최신 이력 한 페이지를 넘도록 실제 STOMP 메시지를 생성한다", async () => {
    for (const message of messages) {
      await messageInput.fill(message);
      await page.getByRole("button", { name: "전송", exact: true }).click();
      await expect(messageLog.getByText(message, { exact: true })).toBeVisible();
      await page.waitForTimeout(1_100);
    }
  });

  await test.step("최신 이력 밖의 검색 결과로 이동하면 대상 메시지를 viewport 안에 표시한다", async () => {
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
    await expect(messageLog.getByText(messages.at(-1)!, { exact: true })).toHaveCount(0);
  });

  await test.step("검색 결과 구간에서 아래로 스크롤하면 다음 페이지를 이어서 불러온다", async () => {
    const isNewerHistoryRequest = (url: URL) =>
      url.pathname === `/api/v1/rooms/${roomId}/messages` && url.searchParams.has("afterSequence");
    let failsNextNewerHistory = true;
    const failNewerHistoryOnce = async (route: Route) => {
      if (!failsNextNewerHistory) {
        await route.continue();
        return;
      }

      failsNextNewerHistory = false;
      await route.fulfill({
        body: JSON.stringify({
          status: 500,
          title: "Internal Server Error",
          type: "about:blank",
        }),
        contentType: "application/problem+json",
        status: 500,
      });
    };
    await page.route(isNewerHistoryRequest, failNewerHistoryOnce);

    await expect(messageLog.getByText(messages.at(-1)!, { exact: true })).toHaveCount(0);
    await scrollToBottomAsUser(messageLog);

    // 불러오기에 실패해도 오류 화면으로 바뀌지 않고 목록 아래에 다시 시도 버튼만 떠야 함
    const newerError = page.locator('[data-chat-message-history-state="newer-error"]');
    await expect(newerError).toBeVisible({ timeout: 30_000 });
    await expect(newerError).toContainText("다음 메시지를 불러오지 못했습니다.");
    await expect(page.getByText("대화 위치로 이동하지 못했습니다.", { exact: true })).toHaveCount(
      0,
    );

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
    await page.unroute(isNewerHistoryRequest, failNewerHistoryOnce);

    // 불러온 메시지가 아래에 붙어도 맨 아래로 끌려 내려가지 않아야 함
    await expect
      .poll(() =>
        messageLog.evaluate(
          (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
        ),
      )
      .toBeGreaterThan(96);

    await scrollToBottomAsUser(messageLog);
    await expect(messageLog.getByText(messages.at(-1)!, { exact: true })).toBeVisible();
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

  await test.step("과거 이력 조회가 실패하면 안내를 표시하고 재시도로 읽던 위치를 복구한다", async () => {
    await reloadToLatestHistory(page, roomId, messageInput);

    const isOlderHistoryRequest = (url: URL) =>
      url.pathname === `/api/v1/rooms/${roomId}/messages` && url.searchParams.has("beforeSequence");
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

    expect((await previousHistoryResponse).ok(), "재시도한 과거 이력 조회가 성공해야 합니다.").toBe(
      true,
    );
    await expect(olderError).toHaveCount(0);
    await expect(messageLog.getByText(messages[2]!, { exact: true })).toBeVisible();
    await expect.poll(() => messageLog.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  });
});

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
