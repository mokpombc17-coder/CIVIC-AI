import {
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
  type Response,
} from "@playwright/test";
import { AUTHENTICATION_SUCCEEDED_EVENT } from "../apps/web/lib/auth/authentication-session-events";
import { registerE2EWindow } from "./chat-e2e-window-layout";

const AUTH_COOKIE_NAME = "civic_ai_access_token";
const LOCAL_E2E_AUTH_SESSION_PATH = "/api/dev/auth/session";

export async function authenticateLocalE2EUser(page: Page, context: BrowserContext): Promise<void> {
  await registerE2EWindow(page);
  await page.goto("/");
  await page.getByRole("button", { name: "로컬 E2E 로그인 갱신", exact: true }).click();

  await expect(page.getByRole("button", { name: "로컬 E2E 로그인 다시 갱신" })).toBeEnabled();

  const authCookie = (await context.cookies()).find((cookie) => cookie.name === AUTH_COOKIE_NAME);

  expect(authCookie, `${AUTH_COOKIE_NAME} 쿠키가 발급되어야 합니다.`).toBeDefined();
  expect(authCookie?.httpOnly).toBe(true);
}

export async function authenticateLocalE2EUserAs(
  page: Page,
  context: BrowserContext,
  subject: string,
): Promise<void> {
  await registerE2EWindow(page);
  await page.goto("/");

  await issueLocalE2EAuthenticationSession(page.request, subject);

  await page.reload();
  await expect(page.getByRole("button", { name: "로컬 E2E 로그인 갱신" })).toBeEnabled();

  const authCookie = (await context.cookies()).find((cookie) => cookie.name === AUTH_COOKIE_NAME);

  expect(
    authCookie,
    `${subject} 사용자의 ${AUTH_COOKIE_NAME} 쿠키가 발급되어야 합니다.`,
  ).toBeDefined();
  expect(authCookie?.httpOnly).toBe(true);
}

export async function issueLocalE2EAuthenticationSession(
  request: APIRequestContext,
  subject: string,
): Promise<void> {
  const response = await request.post(LOCAL_E2E_AUTH_SESSION_PATH, {
    data: {
      subject,
    },
  });

  expect(response.status(), `${subject} 사용자의 E2E 로그인이 성공해야 합니다.`).toBe(204);
}

export async function renewLocalE2EAuthenticationSession(
  page: Page,
  subject: string,
): Promise<void> {
  await issueLocalE2EAuthenticationSession(page.request, subject);
  await page.evaluate((eventName) => {
    window.dispatchEvent(new Event(eventName));
  }, AUTHENTICATION_SUCCEEDED_EVENT);
}

export function waitForLocalE2EAuthenticationSessionResponse(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === LOCAL_E2E_AUTH_SESSION_PATH,
  );
}

export async function createRoomAndEnter(
  page: Page,
  roomName: string,
  { description }: { description?: string } = {},
): Promise<string> {
  await page.goto("/chat");
  await expect(page.getByRole("heading", { name: "토론방", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "토론방 생성", exact: true }).click();
  await page.getByRole("textbox", { name: "제목" }).fill(roomName);
  await page
    .getByRole("textbox", { name: "상세 설명" })
    .fill(description ?? `${roomName} E2E 테스트용 설명입니다.`);

  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/rooms",
  );
  await page.getByRole("button", { name: "요청하기", exact: true }).click();

  const createResponse = await createResponsePromise;
  expect(
    createResponse.status(),
    "createRoomAndEnter는 CHAT_ROOM_CREATION_MODE=DIRECT인 로컬 Backend가 필요합니다.",
  ).toBe(201);

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

  await roomCard.getByRole("button", { name: `${roomName} 자세히 보기`, exact: true }).click();
  await page
    .getByRole("dialog", { name: roomName, exact: true })
    .getByRole("button", { name: "참여하기", exact: true })
    .click();

  await expect(page).toHaveURL(new RegExp(`/chat/${roomId}$`));
  await expect(page.getByRole("heading", { name: roomName, exact: true })).toBeVisible();
}

export async function findPublicRoomCard(page: Page, roomName: string): Promise<Locator> {
  const searchForm = page.getByRole("search", {
    name: "공개 채팅방 검색",
  });
  const searchInput = searchForm.getByRole("searchbox", {
    name: "채팅방 이름 검색",
  });
  const roomCard = page.getByRole("article").filter({
    hasText: roomName,
  });

  await expect(searchForm).toBeVisible();
  await searchInput.fill(roomName);

  const searchResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return (
      response.request().method() === "GET" &&
      url.pathname === "/api/v1/rooms" &&
      url.searchParams.get("query") === roomName
    );
  });

  await searchForm.getByRole("button", { name: "검색", exact: true }).click();

  const response = await searchResponse;
  expect(response.ok(), `공개 방 검색이 성공해야 합니다: ${response.status()}`).toBe(true);

  await expect(roomCard, `${roomName} 공개 방을 검색 결과에서 찾아야 합니다.`).toBeVisible();

  return roomCard;
}

function readRoomId(url: string): string {
  const roomId = new URL(url).pathname.split("/").filter(Boolean).at(-1);

  if (!roomId) {
    throw new Error(`채팅방 URL에서 roomId를 찾지 못했습니다: ${url}`);
  }

  return roomId;
}
