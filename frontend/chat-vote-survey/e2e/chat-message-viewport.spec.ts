import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  authenticateLocalE2EUserAs,
  createE2ERoomName,
  createRoomAndEnter,
  joinPublicRoomAndEnter,
} from "./chat-e2e-helpers";

const ACTIVE_ROOM_LABEL = "채팅 가능";
const INITIAL_MESSAGE_COUNT = 14;
const USER_SCROLL_INPUTS = [
  { kind: "wheel", label: "휠" },
  { kind: "touchstart", label: "터치" },
  { kind: "pointerdown", label: "포인터" },
  { kind: "keydown", label: "PageUp 키" },
] as const;

test("과거 메시지를 읽는 동안 새 메시지 수를 안내하고 요청할 때만 하단으로 이동한다", async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);

  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const roomName = createE2ERoomName("viewport");
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

    for (const input of USER_SCROLL_INPUTS) {
      await test.step(`최신 이동이 시작된 직후 ${input.label} 입력으로 스크롤하면 이동을 멈추고 그 위치를 유지한다`, async () => {
        await memberMessageLog.evaluate(
          (element) =>
            new Promise<void>((resolve) => {
              element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -120 }));
              element.scrollTo({ top: 0 });
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            }),
        );
        await expect.poll(() => memberMessageLog.evaluate((element) => element.scrollTop)).toBe(0);

        await sendMessage(ownerPage, `viewport-interrupt-${input.kind}-${uniqueId}`);
        const newMessageButton = memberPage.getByRole("button", {
          name: "새 메시지 1개, 최신 메시지로 이동",
          exact: true,
        });
        await expect(newMessageButton).toBeVisible({ timeout: 20_000 });

        const buttonHandle = await newMessageButton.elementHandle();
        const position = await memberMessageLog.evaluate(
          (element, { button, kind }) =>
            new Promise<{ distanceFromEnd: number; scrollTop: number }>((resolve) => {
              // 버튼으로 최신 이동이 예약되고 첫 frame이 실행되기 전에 사용자가 위로 스크롤함
              (button as HTMLButtonElement).click();
              element.dispatchEvent(
                kind === "wheel"
                  ? new WheelEvent("wheel", { bubbles: true, deltaY: -120 })
                  : kind === "touchstart"
                    ? new TouchEvent("touchstart", { bubbles: true })
                    : kind === "pointerdown"
                      ? new PointerEvent("pointerdown", { bubbles: true })
                      : new KeyboardEvent("keydown", { bubbles: true, key: "PageUp" }),
              );
              element.scrollTop = 0;

              const waitFrames = (remainingFrames: number) => {
                if (remainingFrames === 0) {
                  resolve({
                    distanceFromEnd:
                      element.scrollHeight - element.scrollTop - element.clientHeight,
                    scrollTop: element.scrollTop,
                  });
                  return;
                }

                requestAnimationFrame(() => waitFrames(remainingFrames - 1));
              };

              waitFrames(12);
            }),
          { button: buttonHandle, kind: input.kind },
        );

        expect(position.scrollTop).toBe(0);
        expect(position.distanceFromEnd).toBeGreaterThan(96);
        await expect(newMessageButton).toHaveCount(0);
      });
    }
  } finally {
    await Promise.all([ownerContext.close(), memberContext.close()]);
  }
});

test("내 메시지와 입장 안내는 viewport 위치 상태에 따라 최신 위치를 따라간다", async ({
  browser,
}, testInfo) => {
  test.setTimeout(150_000);

  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const roomName = createE2ERoomName("vp-follow");
  const ownerContext = await browser.newContext({ baseURL });
  const memberContext = await browser.newContext({
    baseURL,
    viewport: { height: 844, width: 390 },
  });
  const firstNewcomerContext = await browser.newContext({ baseURL });
  const secondNewcomerContext = await browser.newContext({ baseURL });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  const firstNewcomerPage = await firstNewcomerContext.newPage();
  const secondNewcomerPage = await secondNewcomerContext.newPage();
  const seedMessages = Array.from(
    { length: INITIAL_MESSAGE_COUNT },
    (_, index) => `follow-seed-${String(index + 1).padStart(2, "0")}-${uniqueId}`,
  );
  const ownerNewMessage = `follow-owner-new-${uniqueId}`;
  const memberOwnMessage = `follow-member-own-${uniqueId}`;

  try {
    await test.step("방장, 참여자와 나중에 입장할 두 사용자로 로그인한다", async () => {
      await authenticateLocalE2EUserAs(ownerPage, ownerContext, `e2e-follow-owner-${uniqueId}`);
      await authenticateLocalE2EUserAs(memberPage, memberContext, `e2e-follow-member-${uniqueId}`);
      await authenticateLocalE2EUserAs(
        firstNewcomerPage,
        firstNewcomerContext,
        `e2e-follow-newcomer-1-${uniqueId}`,
      );
      await authenticateLocalE2EUserAs(
        secondNewcomerPage,
        secondNewcomerContext,
        `e2e-follow-newcomer-2-${uniqueId}`,
      );
    });

    const roomId = await createRoomAndEnter(ownerPage, roomName);
    await joinPublicRoomAndEnter(memberPage, roomId, roomName);

    const ownerMessageInput = ownerPage.getByRole("textbox", { name: "메시지" });
    const memberMessageLog = memberPage.getByRole("log", { name: `${roomId} 메시지` });
    const memberArrivalAnnouncement = memberPage.locator(
      'p[aria-live="polite"][aria-relevant="additions text"]',
    );

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
      await waitForViewportSettled(memberPage);
      expect(await readDistanceFromEnd(memberMessageLog)).toBeLessThanOrEqual(96);
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

    await test.step("타인의 새 메시지는 도착 안내 문구로 알린다", async () => {
      await sendMessage(ownerPage, ownerNewMessage);
      await expect(
        memberPage.getByRole("button", {
          name: "새 메시지 1개, 최신 메시지로 이동",
          exact: true,
        }),
      ).toBeVisible({ timeout: 20_000 });
      await expect(memberArrivalAnnouncement).toContainText(ownerNewMessage);
    });

    await test.step("detached 상태의 입장 안내는 위치와 새 메시지 수를 바꾸지 않는다", async () => {
      await joinPublicRoomAndEnter(firstNewcomerPage, roomId, roomName);
      await expect(
        memberMessageLog.locator('[data-system-activity="true"]', { hasText: "입장했습니다." }),
      ).toHaveCount(1, { timeout: 20_000 });
      await waitForViewportSettled(memberPage);

      const position = await readFirstVisibleMessage(memberMessageLog);
      expect(position.clientMessageId).toBe(detachedPosition.clientMessageId);
      expect(position.scrollTop).toBe(detachedPosition.scrollTop);
      await expect(
        memberPage.getByRole("button", {
          name: "새 메시지 1개, 최신 메시지로 이동",
          exact: true,
        }),
      ).toBeVisible();
    });

    await test.step("detached 상태에서도 내 메시지를 보내면 최신 위치로 이동한다", async () => {
      await sendMessage(memberPage, memberOwnMessage);

      await expect(memberMessageLog.getByText(memberOwnMessage, { exact: true })).toBeVisible();
      await expect.poll(() => isMessageFullyVisible(memberMessageLog, memberOwnMessage)).toBe(true);
      await expect(
        memberPage.getByRole("button", { name: /^새 메시지 \d+개, 최신 메시지로 이동$/ }),
      ).toHaveCount(0);
    });

    await test.step("최신 위치에 고정된 상태의 입장 안내는 따라가고 새 메시지 수에 포함하지 않는다", async () => {
      await joinPublicRoomAndEnter(secondNewcomerPage, roomId, roomName);
      const joinedActivities = memberMessageLog.locator('[data-system-activity="true"]', {
        hasText: "입장했습니다.",
      });
      await expect(joinedActivities).toHaveCount(2, { timeout: 20_000 });
      await waitForViewportSettled(memberPage);

      await expect.poll(() => readDistanceFromEnd(memberMessageLog)).toBeLessThanOrEqual(96);
      await expect
        .poll(() => isElementFullyVisible(memberMessageLog, joinedActivities.last()))
        .toBe(true);
      await expect(
        memberPage.getByRole("button", { name: /^새 메시지 \d+개, 최신 메시지로 이동$/ }),
      ).toHaveCount(0);
    });
  } finally {
    await Promise.all([
      ownerContext.close(),
      memberContext.close(),
      firstNewcomerContext.close(),
      secondNewcomerContext.close(),
    ]);
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

async function readDistanceFromEnd(messageLog: Locator): Promise<number> {
  return messageLog.evaluate(
    (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
  );
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
