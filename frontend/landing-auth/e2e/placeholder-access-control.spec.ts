import { createServer, type Server } from "node:http";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const WEB_BASE_URL = "https://localhost:3107";
const MAIN_AUTH_HOST = "127.0.0.1";
const MAIN_AUTH_PORT = 4787;
const ACCESS_COOKIE_NAME = "civic_ai_access_token";

let mainAuthServer: Server;

test.beforeAll(async () => {
  mainAuthServer = createServer((request, response) => {
    if (request.url !== "/api/v1/auth/me") {
      response.writeHead(404).end();
      return;
    }

    const cookie = request.headers.cookie ?? "";
    const current = cookie.includes(`${ACCESS_COOKIE_NAME}=participant.payload.signature`)
      ? meResponse("00000000-0000-4000-8000-000000000001", "PARTICIPANT")
      : cookie.includes(`${ACCESS_COOKIE_NAME}=admin.payload.signature`)
        ? meResponse("00000000-0000-4000-8000-000000000002", "ADMIN")
        : null;

    if (!current) {
      response.writeHead(401).end();
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(current));
  });

  await new Promise<void>((resolve, reject) => {
    mainAuthServer.once("error", reject);
    mainAuthServer.listen(MAIN_AUTH_PORT, MAIN_AUTH_HOST, () => resolve());
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    mainAuthServer.close((error) => (error ? reject(error) : resolve()));
  });
});

test("익명 참여자는 채팅 placeholder 대신 로그인으로 이동한다", async ({ page }) => {
  await page.goto("/chat");

  await expect(page).toHaveURL(`${WEB_BASE_URL}/login?returnTo=%2Fchat`);
});

test("일반 사용자가 관리자 placeholder를 열면 권한 없음 화면을 본다", async ({ context, page }) => {
  await authenticate(context, "participant.payload.signature");

  await page.goto("/admin/chat");

  await expect(page).toHaveURL(`${WEB_BASE_URL}/forbidden`);
  await expect(page.getByRole("heading", { name: "권한 없음" })).toBeVisible();
});

test("관리자는 관리자 shell 안에서 준비 중 화면을 본다", async ({ context, page }) => {
  await authenticate(context, "admin.payload.signature");

  await page.goto("/admin/chat");

  await expect(page.getByRole("navigation", { name: "관리자 주요 메뉴" })).toBeVisible();
  await expect(page.getByText("A-CHAT-001")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("준비 중");
});

test("관리자는 별도 참여자 shell로 전환해 참여자 placeholder를 볼 수 있다", async ({
  context,
  page,
}) => {
  await authenticate(context, "admin.payload.signature");

  await page.goto("/chat");

  await expect(page.getByRole("navigation", { name: "참여자 주요 메뉴" })).toBeVisible();
  await expect(page.getByText("U-CHAT-001")).toBeVisible();
});

test("참여자 placeholder는 비활성 API나 WebSocket을 호출하지 않는다", async ({ context, page }) => {
  await authenticate(context, "participant.payload.signature");
  const deferredRequests = collectDeferredBackendRequests(page);

  await page.goto("/chat");

  await expect(page.getByRole("navigation", { name: "참여자 주요 메뉴" })).toBeVisible();
  await expect(page.getByText("U-CHAT-001")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("준비 중");
  await page.waitForLoadState("networkidle");
  expect(deferredRequests).toEqual([]);
});

async function authenticate(context: BrowserContext, token: string): Promise<void> {
  await context.addCookies([
    {
      name: ACCESS_COOKIE_NAME,
      value: token,
      url: WEB_BASE_URL,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
}

function collectDeferredBackendRequests(page: Page): string[] {
  const requests: string[] = [];
  const disabledPrefixes = [
    "/api/",
    "/chat/api/",
    "/chat/ws",
    "/subscriptions/",
    "/vote/api/",
    "/admin/tasks/api/",
    "/admin/simulations/api/",
  ];

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      request.resourceType() === "websocket" ||
      url.protocol === "ws:" ||
      url.protocol === "wss:" ||
      disabledPrefixes.some((prefix) => url.pathname.startsWith(prefix))
    ) {
      requests.push(request.url());
    }
  });

  return requests;
}

function meResponse(userId: string, role: "PARTICIPANT" | "ADMIN") {
  return {
    user_id: userId,
    role,
    permissions: role === "ADMIN" ? ["RAG_ADMIN", "CHAT_ADMIN", "VOTE_ADMIN"] : [],
    account_state: "ACTIVE",
    must_change_password: false,
  };
}
