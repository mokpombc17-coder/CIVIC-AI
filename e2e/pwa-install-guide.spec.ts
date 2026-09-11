import { createServer, type Server, type ServerResponse } from "node:http";
import { devices, expect, test } from "@playwright/test";

const WEB_BASE_URL = process.env.CIVIC_E2E_WEB_BASE_URL ?? "https://localhost:3109";
const MOCK_API_HOST = "127.0.0.1";
const MOCK_API_PORT = Number(process.env.CIVIC_E2E_ADMIN_MOCK_PORT ?? "4791");
const ACCESS_COOKIE_NAME = "civic_ai_access_token";

let mockApiServer: Server;
const iPhone = devices["iPhone 14"];

test.use({
  deviceScaleFactor: iPhone.deviceScaleFactor,
  hasTouch: iPhone.hasTouch,
  isMobile: iPhone.isMobile,
  reducedMotion: "reduce",
  screen: iPhone.screen,
  userAgent: iPhone.userAgent,
  viewport: iPhone.viewport,
});

test.beforeAll(async () => {
  mockApiServer = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${MOCK_API_HOST}:${MOCK_API_PORT}`);

    if (url.pathname === "/api/v1/auth/me") {
      return json(response, {
        account_state: "ACTIVE",
        must_change_password: false,
        permissions: [],
        role: "PARTICIPANT",
        user_id: "00000000-0000-4000-8000-000000000001",
      });
    }
    if (url.pathname === "/api/v1/account/profile") {
      return json(response, {
        account_state: "ACTIVE",
        email: "citizen@example.com",
        preferred_language: "ko",
        rag_answer_detail: "balanced",
        response_version: 3,
        role: "PARTICIPANT",
        two_factor_enabled: false,
        user_id: "00000000-0000-4000-8000-000000000001",
      });
    }

    response.writeHead(404).end();
  });

  await new Promise<void>((resolve, reject) => {
    mockApiServer.once("error", reject);
    mockApiServer.listen(MOCK_API_PORT, MOCK_API_HOST, resolve);
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    mockApiServer.close((error) => (error ? reject(error) : resolve()));
  });
});

test("iOS 사용자는 앱 설치 메뉴에서 홈 화면 추가 안내를 확인한다", async ({ context, page }) => {
  await context.addCookies([
    {
      httpOnly: true,
      name: ACCESS_COOKIE_NAME,
      sameSite: "Lax",
      secure: true,
      url: WEB_BASE_URL,
      value: "participant.payload.signature",
    },
  ]);

  await page.goto("/home");
  const userMenuTrigger = page.getByRole("button", { name: "citizen님 사용자 메뉴" });
  await expect(userMenuTrigger).toBeVisible();
  await userMenuTrigger.click();

  const installButton = page.getByRole("button", { name: "앱 설치" });
  await expect(installButton).toBeEnabled();
  await installButton.click();

  const dialog = page.getByRole("dialog", { name: "홈 화면에 CIVIC.AI 추가" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Safari");
  await expect(dialog).toContainText("공유");
  await expect(dialog).toContainText("홈 화면에 추가");
  await expect(dialog).toContainText("웹 앱으로 열기");

  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box?.width).toBeCloseTo(viewport?.width ?? 0, 0);
  expect(
    Math.abs((box?.y ?? 0) + (box?.height ?? 0) - (viewport?.height ?? 0)),
  ).toBeLessThanOrEqual(2);

  await page.getByRole("button", { name: "확인했어요" }).click();
  await expect(dialog).toBeHidden();
  await expect(userMenuTrigger).toBeFocused();
});

function json(response: ServerResponse, body: unknown) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
