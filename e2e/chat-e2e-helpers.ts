import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";

const AUTH_COOKIE_NAME = "civic_ai_access_token";

export async function authenticateDevUser(page: Page, context: BrowserContext): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "임시 로그인 갱신", exact: true }).click();

  await expect(page.getByRole("button", { name: "임시 로그인 다시 갱신" })).toBeEnabled();

  const authCookie = (await context.cookies()).find((cookie) => cookie.name === AUTH_COOKIE_NAME);

  expect(authCookie, `${AUTH_COOKIE_NAME} 쿠키가 발급되어야 합니다.`).toBeDefined();
  expect(authCookie?.httpOnly).toBe(true);
}

export async function authenticateDevUserAs(
  page: Page,
  context: BrowserContext,
  subject: string,
): Promise<void> {
  await page.goto("/");

  const response = await page.request.post("/api/dev/auth/session", {
    data: {
      subject,
    },
  });

  expect(response.status(), `${subject} 사용자의 임시 로그인이 성공해야 합니다.`).toBe(204);

  await page.reload();
  await expect(page.getByRole("button", { name: "임시 로그인 갱신" })).toBeEnabled();

  const authCookie = (await context.cookies()).find((cookie) => cookie.name === AUTH_COOKIE_NAME);

  expect(
    authCookie,
    `${subject} 사용자의 ${AUTH_COOKIE_NAME} 쿠키가 발급되어야 합니다.`,
  ).toBeDefined();
  expect(authCookie?.httpOnly).toBe(true);
}

export async function createRoomAndEnter(
  page: Page,
  roomName: string,
  { description }: { description?: string } = {},
): Promise<string> {
  await page.goto("/chat");
  await expect(page.getByRole("heading", { name: "채팅방", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "새 채팅방" }).click();
  await page.getByRole("textbox", { name: "방 이름" }).fill(roomName);

  if (description !== undefined) {
    await page.getByRole("textbox", { name: "방 설명" }).fill(description);
  }

  await page.getByText("정책", { exact: true }).click();
  await page.getByRole("button", { name: "채팅방 만들기" }).click();

  await expect(page).toHaveURL(/\/chat\/[A-Za-z0-9_-]+$/);
  await expect(page.getByRole("heading", { name: roomName })).toBeVisible();

  return readRoomId(page.url());
}

export async function joinPublicRoomAndEnter(
  page: Page,
  roomId: string,
  roomName: string,
  { navigate = true }: { navigate?: boolean } = {},
): Promise<void> {
  if (navigate) {
    await page.goto("/chat");
  }

  const roomCard = await findPublicRoomCard(page, roomName);

  await roomCard.getByRole("button", { name: "참여하기", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/chat/${roomId}$`));
  await expect(page.getByRole("heading", { name: roomName, exact: true })).toBeVisible();
}

export async function findPublicRoomCard(page: Page, roomName: string): Promise<Locator> {
  const roomCards = page.getByRole("article");
  const roomCard = page.getByRole("article").filter({
    hasText: roomName,
  });
  const loadMoreButton = page.getByRole("button", {
    name: "공개 방 더 보기",
    exact: true,
  });

  await expect.poll(() => roomCards.count()).toBeGreaterThan(0);

  for (let pageIndex = 0; pageIndex < 100 && (await roomCard.count()) === 0; pageIndex += 1) {
    if ((await loadMoreButton.count()) === 0 || (await loadMoreButton.isDisabled())) {
      break;
    }

    const previousRoomCount = await roomCards.count();
    const nextPageResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === "/api/v1/rooms" &&
        new URL(response.url()).searchParams.has("cursor"),
    );

    await loadMoreButton.click();

    const response = await nextPageResponse;
    expect(response.ok(), `공개 방 다음 페이지 조회가 성공해야 합니다: ${response.status()}`).toBe(
      true,
    );
    await expect.poll(() => roomCards.count()).toBeGreaterThan(previousRoomCount);
  }

  await expect(
    roomCard,
    `${roomName} 공개 방을 cursor pagination 결과에서 찾아야 합니다.`,
  ).toBeVisible();

  return roomCard;
}

function readRoomId(url: string): string {
  const roomId = new URL(url).pathname.split("/").filter(Boolean).at(-1);

  if (!roomId) {
    throw new Error(`채팅방 URL에서 roomId를 찾지 못했습니다: ${url}`);
  }

  return roomId;
}
