import { expect, test } from "@playwright/test";
import { authenticateLocalE2EUserAs, createRoomAndEnter } from "./chat-e2e-helpers";

const ACTIVE_ROOM_LABEL = "채팅 가능";
const MESSAGE_COUNT = 52;

test("메시지 상단 접근이 beforeSequence 이력을 자동 조회하고 읽던 위치를 보존한다", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);

  const uniqueId = crypto.randomUUID();
  const roomName = `e2e-history-${uniqueId}`;
  const messages = Array.from(
    { length: MESSAGE_COUNT },
    (_, index) => `pagination-${String(index + 1).padStart(2, "0")}-${uniqueId}`,
  );

  await authenticateLocalE2EUserAs(page, context, `e2e-pagination-${uniqueId}`);
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

  await test.step("새로고침하면 cursor 없는 최신 메시지 50개만 먼저 복구한다", async () => {
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

    const response = await latestHistoryResponse;
    expect(response.ok(), `최신 메시지 이력 조회가 성공해야 합니다: ${response.status()}`).toBe(
      true,
    );
    await expect(page.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
    await expect(messageInput).toBeEnabled();
    await expect(messageLog.getByText(messages[0]!, { exact: true })).toHaveCount(0);
    await expect(messageLog.getByText(messages.at(-1)!, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "이전 메시지 불러오기", exact: true }),
    ).toHaveCount(0);
  });

  await test.step("상단 접근은 과거 페이지를 조회하고 기존 첫 메시지 위치를 복구한다", async () => {
    const previousHistoryResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === `/api/v1/rooms/${roomId}/messages` &&
        url.searchParams.has("beforeSequence")
      );
    });

    await messageLog.evaluate((element) => element.scrollTo({ top: 0 }));

    const response = await previousHistoryResponse;
    const requestUrl = new URL(response.url());
    expect(response.ok(), `과거 메시지 이력 조회가 성공해야 합니다: ${response.status()}`).toBe(
      true,
    );
    expect(requestUrl.searchParams.get("beforeSequence")).toBe("3");
    await expect(messageLog.getByText(messages[2]!, { exact: true })).toBeVisible();
    await expect.poll(() => messageLog.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    await messageLog.evaluate((element) => element.scrollTo({ top: 0 }));
    await expect(messageLog.getByText(messages[0]!, { exact: true })).toBeVisible();

    await messageLog.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
    await expect(messageLog.getByText(messages.at(-1)!, { exact: true })).toBeVisible();
  });

  await test.step("가상화는 전체 이력을 DOM에 동시에 렌더링하지 않는다", async () => {
    const renderedMessages = messageLog.locator("li");
    expect(await renderedMessages.count()).toBeLessThan(MESSAGE_COUNT);
  });
});
