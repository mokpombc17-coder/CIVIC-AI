import { expect, type BrowserContext, type Page } from "@playwright/test";

const AUTH_COOKIE_NAME = "civic_ai_access_token";

export async function authenticateDevUser(page: Page, context: BrowserContext): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "임시 로그인", exact: true }).click();

  await expect(page.getByRole("button", { name: "임시 로그인 완료" })).toBeDisabled();
  await expect(
    page.getByText("브라우저가 HttpOnly 쿠키를 보관하고 이후 채팅 요청에 자동으로 전달합니다."),
  ).toBeVisible();

  const authCookie = (await context.cookies()).find((cookie) => cookie.name === AUTH_COOKIE_NAME);

  expect(authCookie, `${AUTH_COOKIE_NAME} 쿠키가 발급되어야 합니다.`).toBeDefined();
  expect(authCookie?.httpOnly).toBe(true);
}

export async function createRoomAndEnter(page: Page, roomName: string): Promise<string> {
  await page.goto("/chat");
  await expect(page.getByRole("heading", { name: "채팅방", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "새 채팅방" }).click();
  await page.getByRole("textbox", { name: "방 이름" }).fill(roomName);
  await page.getByRole("button", { name: "채팅방 만들기" }).click();

  await expect(page).toHaveURL(/\/chat\/[A-Za-z0-9_-]+$/);
  await expect(page.getByRole("heading", { name: roomName })).toBeVisible();

  return readRoomId(page.url());
}

function readRoomId(url: string): string {
  const roomId = new URL(url).pathname.split("/").filter(Boolean).at(-1);

  if (!roomId) {
    throw new Error(`채팅방 URL에서 roomId를 찾지 못했습니다: ${url}`);
  }

  return roomId;
}
