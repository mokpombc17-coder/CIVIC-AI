import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  authenticateLocalE2EUserAs,
  createRoomAndEnter,
  joinPublicRoomAndEnter,
} from "./chat-e2e-helpers";

const ACTIVE_ROOM_LABEL = "채팅 가능";
const INITIAL_MESSAGE_COUNT = 14;

test("과거 메시지를 읽는 동안 새 메시지 수를 안내하고 요청할 때만 하단으로 이동한다", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);

  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const roomName = `e2e-viewport-${uniqueId}`;
  const ownerContext = await browser.newContext({ baseURL });
  const memberContext = await browser.newContext({
    baseURL,
    viewport: { height: 844, width: 390 },
  });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  const seedMessages = Array.from(
    { length: INITIAL_MESSAGE_COUNT },
    (_, index) => `viewport-seed-${String(index + 1).padStart(2, "0")}-${uniqueId}`,
  );
  const firstNewMessage = `viewport-new-01-${uniqueId}`;
  const secondNewMessage = `viewport-new-02-${uniqueId}`;

  try {
    await test.step("서로 다른 사용자로 로그인해 같은 공개 방의 실시간 구독을 준비한다", async () => {
      await authenticateLocalE2EUserAs(ownerPage, ownerContext, `e2e-viewport-owner-${uniqueId}`);
      await authenticateLocalE2EUserAs(
        memberPage,
        memberContext,
        `e2e-viewport-member-${uniqueId}`,
      );
    });

    const roomId = await createRoomAndEnter(ownerPage, roomName);
    await joinPublicRoomAndEnter(memberPage, roomId, roomName);

    const ownerMessageInput = ownerPage.getByRole("textbox", { name: "메시지" });
    const memberMessageLog = memberPage.getByRole("log", { name: `${roomId} 메시지` });

    await test.step("스크롤 가능한 이력을 실제 STOMP 메시지로 만든다", async () => {
      await expect(ownerPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(memberPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(ownerMessageInput).toBeEnabled();

      for (const message of seedMessages) {
        await sendMessage(ownerPage, message);
      }

      await expect(memberMessageLog.getByText(seedMessages.at(-1)!, { exact: true })).toBeVisible({
        timeout: 40_000,
      });
    });

    await test.step("visual viewport가 줄어들어도 최신 메시지를 하단에 고정한다", async () => {
      await memberPage.setViewportSize({ height: 560, width: 390 });
      await waitForViewportSettled(memberPage);
      await expect(memberMessageLog.getByText(seedMessages.at(-1)!, { exact: true })).toBeVisible();
      await expect
        .poll(() => isMessageFullyVisible(memberMessageLog, seedMessages.at(-1)!))
        .toBe(true);

      await memberPage.setViewportSize({ height: 844, width: 390 });
      await waitForViewportSettled(memberPage);
      await expect
        .poll(() => isMessageFullyVisible(memberMessageLog, seedMessages.at(-1)!))
        .toBe(true);
    });

    const detachedPosition =
      await test.step("참여자가 과거 메시지 위치로 이동해 detached 상태가 된다", async () => {
        await memberMessageLog.evaluate(
          (element) =>
            new Promise<void>((resolve) => {
              element.scrollTo({ top: 0 });
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            }),
        );

        await expect.poll(() => memberMessageLog.evaluate((element) => element.scrollTop)).toBe(0);

        const position = await readFirstVisibleMessage(memberMessageLog);
        expect(position.distanceFromEnd).toBeGreaterThan(96);

        return position;
      });

    const resizedDetachedPosition =
      await test.step("과거 메시지를 읽을 때는 visual viewport가 줄어들어도 위치를 유지한다", async () => {
        await memberPage.setViewportSize({ height: 560, width: 390 });

        const position = await readFirstVisibleMessage(memberMessageLog);
        expect(position.clientMessageId).toBe(detachedPosition.clientMessageId);
        expect(position.scrollTop).toBe(detachedPosition.scrollTop);
        expect(
          Math.abs(position.offsetFromViewportTop - detachedPosition.offsetFromViewportTop),
        ).toBeLessThanOrEqual(1);

        return position;
      });

    await test.step("타인의 새 메시지는 위치를 유지하며 안내 개수만 누적한다", async () => {
      await sendMessage(ownerPage, firstNewMessage);
      await expect(
        memberPage.getByRole("button", {
          name: "새 메시지 1개, 최신 메시지로 이동",
          exact: true,
        }),
      ).toBeVisible({ timeout: 20_000 });

      await sendMessage(ownerPage, secondNewMessage);
      const newMessageButton = memberPage.getByRole("button", {
        name: "새 메시지 2개, 최신 메시지로 이동",
        exact: true,
      });
      await expect(newMessageButton).toBeVisible({ timeout: 20_000 });

      const positionAfterMessages = await readFirstVisibleMessage(memberMessageLog);
      expect(positionAfterMessages.clientMessageId).toBe(resizedDetachedPosition.clientMessageId);
      expect(positionAfterMessages.scrollTop).toBe(resizedDetachedPosition.scrollTop);
      expect(
        Math.abs(
          positionAfterMessages.offsetFromViewportTop -
            resizedDetachedPosition.offsetFromViewportTop,
        ),
      ).toBeLessThanOrEqual(1);
    });

    await test.step("안내 버튼을 누르면 최신 메시지로 이동하고 안내가 사라진다", async () => {
      const newMessageButton = memberPage.getByRole("button", {
        name: "새 메시지 2개, 최신 메시지로 이동",
        exact: true,
      });

      await newMessageButton.click();

      await expect(newMessageButton).toHaveCount(0);
      await expect(memberMessageLog.getByText(secondNewMessage, { exact: true })).toBeVisible();
      await expect.poll(() => isMessageFullyVisible(memberMessageLog, secondNewMessage)).toBe(true);
    });
  } finally {
    await Promise.all([ownerContext.close(), memberContext.close()]);
  }
});

async function sendMessage(page: Page, message: string): Promise<void> {
  await page.getByRole("textbox", { name: "메시지" }).fill(message);
  await page.getByRole("button", { name: "전송", exact: true }).click();
}

async function waitForViewportSettled(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let remainingFrames = 8;
        const waitForNextFrame = () => {
          remainingFrames -= 1;

          if (remainingFrames === 0) {
            resolve();
            return;
          }

          requestAnimationFrame(waitForNextFrame);
        };

        requestAnimationFrame(waitForNextFrame);
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

async function readFirstVisibleMessage(messageLog: Locator): Promise<ViewportPosition> {
  return messageLog.evaluate((element) => {
    const viewportBounds = element.getBoundingClientRect();
    const visibleMessage = [...element.querySelectorAll<HTMLElement>("li[data-client-message-id]")]
      .filter((message) => {
        const bounds = message.getBoundingClientRect();
        return bounds.bottom > viewportBounds.top && bounds.top < viewportBounds.bottom;
      })
      .sort(
        (left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top,
      )[0];
    const clientMessageId = visibleMessage?.dataset.clientMessageId;

    if (!visibleMessage || !clientMessageId) {
      throw new Error("현재 viewport에서 첫 번째 메시지를 찾지 못했습니다.");
    }

    return {
      clientMessageId,
      distanceFromEnd: element.scrollHeight - element.scrollTop - element.clientHeight,
      offsetFromViewportTop: visibleMessage.getBoundingClientRect().top - viewportBounds.top,
      scrollTop: element.scrollTop,
    };
  });
}

type ViewportPosition = Readonly<{
  clientMessageId: string;
  distanceFromEnd: number;
  offsetFromViewportTop: number;
  scrollTop: number;
}>;
