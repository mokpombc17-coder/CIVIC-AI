import { expect, test } from "@playwright/test";
import { authenticateDevUser, createRoomAndEnter } from "./chat-e2e-helpers";

test("Enter 전송, Shift+Enter 줄바꿈, IME 조합 보호 정책을 적용한다", async ({ context, page }) => {
  const uniqueId = crypto.randomUUID();
  const roomName = `e2e-composer-${uniqueId}`;

  await authenticateDevUser(page, context);
  const roomId = await createRoomAndEnter(page, roomName);
  const messageInput = page.getByRole("textbox", { name: "메시지" });
  const messageLog = page.getByRole("log", { name: `${roomId} 메시지` });

  await expect(
    page.getByText("이 탭에서 실시간 채팅을 사용 중입니다.", { exact: true }),
  ).toBeVisible();
  await expect(messageInput).toBeEnabled();

  const firstLine = `첫 줄 ${uniqueId}`;
  const secondLine = `둘째 줄 ${uniqueId}`;
  await messageInput.fill(firstLine);
  await messageInput.press("Shift+Enter");
  await messageInput.type(secondLine);

  await expect(messageInput).toHaveValue(`${firstLine}\n${secondLine}`);
  await expect(messageLog.locator("li").filter({ hasText: firstLine })).toHaveCount(0);

  await messageInput.press("Enter");

  const multilineMessage = messageLog.locator("li").filter({ hasText: firstLine });
  await expect(multilineMessage).toContainText(firstLine);
  await expect(multilineMessage).toContainText(secondLine);
  await expect(messageInput).toHaveValue("");

  const composingMessage = `한글 조합 ${uniqueId}`;
  await messageInput.fill(composingMessage);
  await messageInput.dispatchEvent("keydown", {
    bubbles: true,
    code: "Enter",
    isComposing: true,
    key: "Enter",
    keyCode: 229,
  });

  await expect(messageInput).toHaveValue(composingMessage);
  await expect(messageLog.locator("li").filter({ hasText: composingMessage })).toHaveCount(0);

  await messageInput.press("Enter");
  await expect(messageLog.locator("li").filter({ hasText: composingMessage })).toBeVisible();
});
