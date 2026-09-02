import { expect, test, type Request } from "@playwright/test";
import { authenticateLocalE2EUserAs } from "./chat-e2e-helpers";

test("채팅방 조회 중 browser history back은 진행 중인 요청을 오류 표시 없이 취소한다", async ({
  context,
  page,
}) => {
  const uniqueId = crypto.randomUUID();
  let releaseRoomDetails: (() => void) | undefined;
  const roomDetailsRelease = new Promise<void>((resolve) => {
    releaseRoomDetails = resolve;
  });
  let notifyRoomDetailsStarted: ((request: Request) => void) | undefined;
  const roomDetailsStarted = new Promise<Request>((resolve) => {
    notifyRoomDetailsStarted = resolve;
  });

  await authenticateLocalE2EUserAs(page, context, `e2e-history-back-member-${uniqueId}`);
  await page.goto("/chat");
  await expect(page.getByRole("heading", { name: "토론방", exact: true })).toBeVisible();
  const roomCard = page.getByRole("list", { name: "공개 채팅방" }).getByRole("article").first();
  await expect(roomCard).toBeVisible();
  const roomId = await roomCard.getAttribute("data-room-id");
  if (!roomId) {
    throw new Error("공개 채팅방 카드에서 roomId를 확인할 수 없습니다.");
  }

  await page.route("**/api/v1/rooms/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isRoomDetails =
      request.method() === "GET" && /^\/api\/v1\/rooms\/[^/]+$/.test(url.pathname);

    if (!isRoomDetails) {
      await route.continue();
      return;
    }

    notifyRoomDetailsStarted?.(request);
    await roomDetailsRelease;
    await route.continue().catch(() => undefined);
  });

  await roomCard.getByRole("button", { name: /자세히 보기$/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "참여하기", exact: true }).click();

  await roomDetailsStarted;
  await expect(page).toHaveURL(new RegExp(`/chat/${roomId}$`));
  await page.evaluate(() => {
    const seen = new Set<string>();
    const captureTransientChatErrors = () => {
      const selectors = [
        '[data-chat-room-list-state="error"]',
        '[data-chat-message-history-state="sync-error"]',
      ];

      for (const element of document.querySelectorAll(selectors.join(","))) {
        seen.add(element.textContent?.trim() ?? "unknown chat error");
      }

      for (const alert of document.querySelectorAll('[role="alert"]')) {
        const text = alert.textContent?.trim() ?? "";
        if (
          text.includes("채팅방 정보를 불러오지 못했습니다.") ||
          text.includes("메시지 이력을 불러오지 못했습니다.") ||
          text.includes("참여 중인 방을 불러오지 못했습니다.")
        ) {
          seen.add(text);
        }
      }
    };
    const observer = new MutationObserver(captureTransientChatErrors);
    observer.observe(document.body, { childList: true, subtree: true });
    Reflect.set(window, "__chatHistoryBackAlertRecorder", { observer, seen });
  });

  const backNavigation = page.goBack();
  await expect(page).toHaveURL(/\/chat$/);
  releaseRoomDetails?.();
  await backNavigation;
  await page.waitForTimeout(200);

  const transientErrors = await page.evaluate(() => {
    const recorder = Reflect.get(window, "__chatHistoryBackAlertRecorder") as
      { observer: MutationObserver; seen: Set<string> } | undefined;

    recorder?.observer.disconnect();
    return recorder ? [...recorder.seen] : [];
  });

  expect(transientErrors).toEqual([]);
  await expect(page.locator('[data-chat-room-list-state="error"]')).toHaveCount(0);
  await expect(page.locator('[data-chat-message-history-state="sync-error"]')).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "채팅방 정보를 불러오지 못했습니다." }),
  ).toHaveCount(0);
});
