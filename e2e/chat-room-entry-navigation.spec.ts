import { expect, test, type Page } from "@playwright/test";
import {
  authenticateDevUserAs,
  createRoomAndEnter,
  joinPublicRoomAndEnter,
} from "./chat-e2e-helpers";

const ACTIVE_ROOM_LABEL = "채팅 가능";
const MESSAGE_COUNT = 52;

test("재진입 시 저장된 읽음 위치를 복구하고 실패한 과거 이력 탐색을 재시도한다", async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);

  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const roomName = `e2e-entry-position-${uniqueId}`;
  const messages = Array.from(
    { length: MESSAGE_COUNT },
    (_, index) => `entry-position-${String(index + 1).padStart(2, "0")}-${uniqueId}`,
  );
  const ownerContext = await browser.newContext({ baseURL });
  const memberContext = await browser.newContext({ baseURL });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();

  try {
    await authenticateDevUserAs(ownerPage, ownerContext, `e2e-entry-owner-${uniqueId}`);
    await authenticateDevUserAs(memberPage, memberContext, `e2e-entry-member-${uniqueId}`);

    const roomId = await createRoomAndEnter(ownerPage, roomName);
    await expect(ownerPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
    await joinPublicRoomAndEnter(memberPage, roomId, roomName);
    await expect(
      memberPage.getByRole("status").filter({ hasText: ACTIVE_ROOM_LABEL }),
    ).toBeVisible();

    const memberMessageLog = memberPage.getByRole("log", { name: `${roomId} 메시지` });

    await test.step("참여자가 첫 메시지를 실제로 읽은 cursor를 서버에 저장한다", async () => {
      await setDocumentFocusState(ownerPage, false);
      await memberPage.bringToFront();
      await setDocumentFocusState(memberPage, true);

      const readStateResponse = waitForReadState(memberPage, roomId);
      await sendMessage(ownerPage, messages[0]!);
      await expectConfirmedMessage(memberPage, roomId, messages[0]!);

      const response = await readStateResponse;
      expect(response.ok(), `read-state 저장이 성공해야 합니다: ${response.status()}`).toBe(true);
      const body = (await response.json()) as { readThroughSequence?: number };
      expect(body.readThroughSequence).toBe(1);
    });

    await memberPage.goto("/chat");
    await expect(memberPage.getByRole("heading", { name: "채팅방", exact: true })).toBeVisible();

    await test.step("참여자가 자리를 비운 동안 최신 이력 한 페이지를 넘겨 생성한다", async () => {
      await ownerPage.bringToFront();
      await setDocumentFocusState(ownerPage, true);

      for (const message of messages.slice(1)) {
        await sendMessage(ownerPage, message);
        await expectConfirmedMessage(ownerPage, roomId, message);
        await ownerPage.waitForTimeout(1_100);
      }
    });

    let allowOlderHistory = false;
    let failedOlderHistoryRequestCount = 0;
    let entryReadStateRequestCount = 0;

    await memberPage.route(`**/api/v1/rooms/${roomId}/messages**`, async (route) => {
      const url = new URL(route.request().url());

      if (url.searchParams.has("beforeSequence") && !allowOlderHistory) {
        failedOlderHistoryRequestCount += 1;
        await route.fulfill({
          status: 500,
          contentType: "application/problem+json",
          body: JSON.stringify({
            type: "urn:hamcheeze:problem:internal-error",
            title: "Internal server error",
            status: 500,
            detail: "The older message history is temporarily unavailable.",
            instance: `/api/v1/rooms/${roomId}/messages`,
            code: "INTERNAL_ERROR",
            retryable: false,
          }),
        });
        return;
      }

      await route.continue();
    });

    memberPage.on("request", (request) => {
      const url = new URL(request.url());

      if (request.method() === "PUT" && url.pathname === `/api/v1/rooms/${roomId}/read-state`) {
        entryReadStateRequestCount += 1;
      }
    });

    await test.step("자동 탐색 실패 중에는 읽음 위치를 올리지 않고 재시도 안내를 표시한다", async () => {
      await memberPage.goto(`/chat/${roomId}`);
      await expect(memberPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(
        memberPage.getByText("마지막으로 읽은 위치를 찾지 못했습니다.", { exact: true }),
      ).toBeVisible();

      expect(failedOlderHistoryRequestCount).toBeGreaterThan(0);
      expect(entryReadStateRequestCount).toBe(0);
      await expect(memberPage.getByRole("separator", { name: "여기까지 읽었습니다" })).toHaveCount(
        0,
      );
    });

    await test.step("재시도하면 첫 페이지 이전 이력을 조회하고 저장 cursor 구분선으로 이동한다", async () => {
      allowOlderHistory = true;
      const olderHistoryResponse = memberPage.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === "GET" &&
          url.pathname === `/api/v1/rooms/${roomId}/messages` &&
          url.searchParams.has("beforeSequence")
        );
      });

      await memberPage.getByRole("button", { name: "읽은 위치 다시 찾기" }).click();

      const response = await olderHistoryResponse;
      expect(response.ok(), `과거 이력 재조회가 성공해야 합니다: ${response.status()}`).toBe(true);
      expect(new URL(response.url()).searchParams.get("beforeSequence")).toBe("3");

      const boundary = memberPage.getByRole("separator", { name: "여기까지 읽었습니다" });
      await expect(boundary).toHaveAttribute("data-read-boundary-after-sequence", "1");
      await expect(boundary).toBeVisible();
      await expect(memberMessageLog.getByText(messages[1]!, { exact: true })).toBeVisible();
      await expect.poll(() => isBoundaryInsideViewport(memberMessageLog)).toBe(true);
      await expect.poll(() => isViewportAwayFromLatest(memberMessageLog)).toBe(true);
      expect(entryReadStateRequestCount).toBe(0);
    });
  } finally {
    await Promise.all([
      ownerContext.close().catch(() => {}),
      memberContext.close().catch(() => {}),
    ]);
  }
});

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

async function setDocumentFocusState(page: Page, focused: boolean): Promise<void> {
  await page.evaluate((nextFocused) => {
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => nextFocused,
    });
    window.dispatchEvent(new Event(nextFocused ? "focus" : "blur"));
  }, focused);
}

async function isBoundaryInsideViewport(messageLog: ReturnType<Page["getByRole"]>) {
  return messageLog.evaluate((element) => {
    const boundary = element.querySelector<HTMLElement>("[data-read-boundary-after-sequence]");

    if (!boundary) {
      return false;
    }

    const viewportRect = element.getBoundingClientRect();
    const boundaryRect = boundary.getBoundingClientRect();
    return boundaryRect.top >= viewportRect.top && boundaryRect.bottom <= viewportRect.bottom;
  });
}

async function isViewportAwayFromLatest(messageLog: ReturnType<Page["getByRole"]>) {
  return messageLog.evaluate(
    (element) => element.scrollTop + element.clientHeight < element.scrollHeight - 1,
  );
}
