import { expect, test, type Page } from "@playwright/test";
import {
  authenticateLocalE2EUserAs,
  createRoomAndEnter,
  joinPublicRoomAndEnter,
} from "./chat-e2e-helpers";

const ACTIVE_ROOM_LABEL = "채팅 가능";
const MESSAGE_COUNT = 52;

test("재진입 시 저장된 읽음 위치로 바로 이동하고 실패한 위치 조회를 재시도한다", async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);

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
    await authenticateLocalE2EUserAs(ownerPage, ownerContext, `e2e-entry-owner-${uniqueId}`);
    await authenticateLocalE2EUserAs(memberPage, memberContext, `e2e-entry-member-${uniqueId}`);

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
    await expect(memberPage.getByRole("heading", { name: "토론방", exact: true })).toBeVisible();

    await test.step("참여자가 자리를 비운 동안 최신 이력 한 페이지를 넘겨 생성한다", async () => {
      await ownerPage.bringToFront();
      await setDocumentFocusState(ownerPage, true);

      for (const message of messages.slice(1)) {
        await sendMessage(ownerPage, message);
        await expectConfirmedMessage(ownerPage, roomId, message);
        await ownerPage.waitForTimeout(1_100);
      }
    });

    let allowFirstUnreadLookup = false;
    let failedFirstUnreadLookupCount = 0;
    let olderHistoryRequestCount = 0;
    let entryReadStateRequestCount = 0;
    const isFirstUnreadLookup = (url: URL) =>
      url.searchParams.has("afterSequence") && url.searchParams.get("limit") === "1";

    await memberPage.route(`**/api/v1/rooms/${roomId}/messages**`, async (route) => {
      const url = new URL(route.request().url());

      if (url.searchParams.has("beforeSequence")) {
        olderHistoryRequestCount += 1;
      }

      if (isFirstUnreadLookup(url) && !allowFirstUnreadLookup) {
        failedFirstUnreadLookupCount += 1;
        await route.fulfill({
          status: 500,
          contentType: "application/problem+json",
          body: JSON.stringify({
            type: "urn:hamcheeze:problem:internal-error",
            title: "Internal server error",
            status: 500,
            detail: "The message history is temporarily unavailable.",
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

    await test.step("첫 안 읽은 메시지를 찾지 못하면 최신 메시지와 다시 찾기 안내를 보여 주고 읽은 위치를 저장하지 않는다", async () => {
      await memberPage.goto(`/chat/${roomId}`);
      await expect(memberPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(
        memberPage.getByText("마지막으로 읽은 위치를 찾지 못했습니다.", { exact: true }),
      ).toBeVisible();
      await expect(memberMessageLog.getByText(messages.at(-1)!, { exact: true })).toBeVisible();

      expect(failedFirstUnreadLookupCount).toBeGreaterThan(0);
      expect(entryReadStateRequestCount).toBe(0);
      await expect(memberPage.getByRole("separator", { name: "여기까지 읽었습니다" })).toHaveCount(
        0,
      );
      // 읽은 위치를 찾으려고 과거 메시지를 거슬러 불러오지 않아야 함
      expect(olderHistoryRequestCount).toBe(0);
    });

    await test.step("다시 찾으면 구분선 위치로 바로 열고 화면에 보인 메시지까지만 읽음 처리한다", async () => {
      allowFirstUnreadLookup = true;
      await memberPage.bringToFront();
      await setDocumentFocusState(memberPage, true);
      const readStateResponse = waitForReadState(memberPage, roomId);
      const firstUnreadResponse = memberPage.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === "GET" &&
          url.pathname === `/api/v1/rooms/${roomId}/messages` &&
          isFirstUnreadLookup(url)
        );
      });

      await memberPage.getByRole("button", { name: "읽은 위치 다시 찾기" }).click();

      const response = await firstUnreadResponse;
      expect(response.ok(), `첫 안 읽은 메시지 조회가 성공해야 합니다: ${response.status()}`).toBe(
        true,
      );
      expect(new URL(response.url()).searchParams.get("afterSequence")).toBe("1");

      const boundary = memberPage.getByRole("separator", { name: "여기까지 읽었습니다" });
      await expect(boundary).toHaveAttribute("data-read-boundary-after-sequence", "1");
      await expect(boundary).toBeVisible();
      await expect(memberMessageLog.getByText(messages[1]!, { exact: true })).toBeVisible();
      await expect.poll(() => isBoundaryInsideViewport(memberMessageLog)).toBe(true);
      await expect.poll(() => isViewportAwayFromLatest(memberMessageLog)).toBe(true);
      await expect(
        memberPage.getByRole("button", { name: "최신 대화로 이동", exact: true }),
      ).toBeVisible();

      // 구분선 아래로 화면에 보인 메시지까지만 읽음 처리되므로 저장 순번(1)보다 크고 최신(52)보다 작아야 함
      const readState = await readStateResponse;
      expect(readState.ok(), `read-state 저장이 성공해야 합니다: ${readState.status()}`).toBe(true);
      const body = (await readState.json()) as { readThroughSequence?: number };
      expect(body.readThroughSequence).toBeGreaterThan(1);
      expect(body.readThroughSequence).toBeLessThan(MESSAGE_COUNT);
      expect(olderHistoryRequestCount).toBe(0);
    });

    await test.step("다른 탭에 넘긴 사용권을 되찾아도 읽은 위치로 이동한 대화와 구분선을 보던 높이 그대로 복원한다", async () => {
      const positionBeforeReplace = await readTopVisibleMessage(memberMessageLog);
      const otherPage = await memberContext.newPage();

      try {
        await otherPage.goto(memberPage.url());
        await expect(
          otherPage.getByRole("status").filter({ hasText: ACTIVE_ROOM_LABEL }),
        ).toBeVisible();
        const tabReplacedNotice = memberPage.locator('[data-chat-session-notice="replaced"]');
        await expect(tabReplacedNotice).toBeVisible();

        const restoreResponse = memberPage.waitForResponse((response) => {
          const url = new URL(response.url());
          return (
            response.request().method() === "GET" &&
            url.pathname.startsWith(`/api/v1/rooms/${roomId}/messages/`) &&
            url.pathname.endsWith("/context")
          );
        });
        await memberPage.bringToFront();
        await tabReplacedNotice
          .getByRole("button", { name: "여기서 계속하기", exact: true })
          .click();

        expect((await restoreResponse).ok(), "보던 위치 주변 대화를 다시 받아야 합니다.").toBe(
          true,
        );
        await expect(
          memberPage.getByRole("status").filter({ hasText: ACTIVE_ROOM_LABEL }),
        ).toBeVisible();
        // 입장 위치는 방에 들어올 때 한 번만 정하므로 사용권을 되찾아도 구분선이 옮겨지지 않아야 함
        await expect(
          memberPage.getByRole("separator", { name: "여기까지 읽었습니다" }),
        ).toHaveAttribute("data-read-boundary-after-sequence", "1");
        await expect
          .poll(async () => {
            const offset = await readMessageOffset(
              memberMessageLog,
              positionBeforeReplace.clientMessageId,
            );
            return offset === null
              ? Number.POSITIVE_INFINITY
              : Math.abs(offset - positionBeforeReplace.offsetFromViewportTop);
          })
          .toBeLessThanOrEqual(2);
        await expect(
          memberPage.getByRole("button", { name: "최신 대화로 이동", exact: true }),
        ).toBeVisible();
      } finally {
        await otherPage.close();
      }
    });

    await test.step("아래로 끝까지 읽으면 실시간 목록으로 바뀌고 마지막 메시지까지 읽음 처리한다", async () => {
      const latestReadState = memberPage.waitForResponse(async (response) => {
        const url = new URL(response.url());

        if (
          response.request().method() !== "PUT" ||
          url.pathname !== `/api/v1/rooms/${roomId}/read-state`
        ) {
          return false;
        }

        const body = (await response.json()) as { readThroughSequence?: number };
        return body.readThroughSequence === MESSAGE_COUNT;
      });

      await expect
        .poll(
          async () => {
            await scrollToBottomAsUser(memberMessageLog);
            return memberPage
              .getByRole("button", { name: "최신 대화로 이동", exact: true })
              .count();
          },
          { timeout: 30_000 },
        )
        .toBe(0);
      await scrollToBottomAsUser(memberMessageLog);
      await expect(memberMessageLog.getByText(messages.at(-1)!, { exact: true })).toBeVisible();
      expect((await latestReadState).ok(), "마지막 메시지 읽음 저장이 성공해야 합니다.").toBe(true);
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

async function scrollToBottomAsUser(messageLog: ReturnType<Page["getByRole"]>) {
  await messageLog.evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 120 }));
        element.scrollTo({ top: element.scrollHeight });
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function isViewportAwayFromLatest(messageLog: ReturnType<Page["getByRole"]>) {
  return messageLog.evaluate(
    (element) => element.scrollTop + element.clientHeight < element.scrollHeight - 1,
  );
}

async function readTopVisibleMessage(
  messageLog: ReturnType<Page["getByRole"]>,
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

async function readMessageOffset(
  messageLog: ReturnType<Page["getByRole"]>,
  clientMessageId: string,
): Promise<number | null> {
  return messageLog.evaluate((element, id) => {
    const row = element.querySelector<HTMLElement>(`li[data-client-message-id="${id}"]`);
    return row ? row.getBoundingClientRect().top - element.getBoundingClientRect().top : null;
  }, clientMessageId);
}
