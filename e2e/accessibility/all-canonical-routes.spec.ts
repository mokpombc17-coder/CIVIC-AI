import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { voteSurveyCurrentFixture, voteSurveyLatestFixture } from "../fixtures/vote-survey";

const WEB_BASE_URL = "https://localhost:3109";
const MOCK_API_HOST = "127.0.0.1";
const MOCK_API_PORT = 4791;
const ACCESS_COOKIE_NAME = "civic_ai_access_token";

type Screen = Readonly<{
  id: string;
  canonical_title: string;
  audience: "PUBLIC" | "PARTICIPANT" | "ADMIN" | "AUTHENTICATED";
  route: string;
  status: "FUNCTIONAL" | "PLACEHOLDER";
}>;

const registry = JSON.parse(
  readFileSync(
    path.resolve(process.cwd(), "apps/web/lib/screens/screens.v1.generated.json"),
    "utf8",
  ),
) as { screens: Screen[] };

let mockApiServer: Server;

test.beforeAll(async () => {
  mockApiServer = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${MOCK_API_HOST}:${MOCK_API_PORT}`);
    if (url.pathname === "/api/v1/auth/me") {
      const cookie = request.headers.cookie ?? "";
      if (cookie.includes(`${ACCESS_COOKIE_NAME}=admin.payload.signature`)) {
        return json(response, meResponse("00000000-0000-4000-8000-000000000002", "HIGHEST_ADMIN"));
      }
      if (cookie.includes(`${ACCESS_COOKIE_NAME}=participant.payload.signature`)) {
        return json(response, meResponse("00000000-0000-4000-8000-000000000001", "PARTICIPANT"));
      }
      response.writeHead(401).end();
      return;
    }
    if (url.pathname === "/api/v1/auth/csrf") {
      return json(response, { csrf_token: "all-routes-csrf" });
    }
    if (url.pathname === "/api/v1/account/profile") {
      return json(response, profileFixture);
    }
    if (url.pathname === "/api/v1/me/surveys/current") {
      return json(response, voteSurveyCurrentFixture);
    }
    if (url.pathname === "/api/v1/me/service-eligibility") {
      return json(response, {
        activeRoundId: voteSurveyCurrentFixture.round.id,
        capabilities: ["VIEW_CURRENT_SURVEY", "VIEW_OWN_SURVEY_RESPONSES"],
        eligible: true,
        evaluatedAt: "2026-09-02T00:00:00Z",
        nextAction: null,
        reason: null,
        surveyRequirement: "SATISFIED",
      });
    }
    if (url.pathname === "/api/v1/me/survey-responses/latest") {
      return json(response, voteSurveyLatestFixture);
    }
    if (url.pathname === "/api/v1/admin/users") {
      return json(response, { items: [adminUserFixture, participantUserFixture] });
    }
    if (url.pathname === "/api/v1/admin/audit") {
      return json(response, { items: [auditFixture] });
    }
    if (url.pathname === "/api/v1/admin/feature-gates") {
      return json(response, { items: [] });
    }
    if (url.pathname === "/internal/v1/rag/folders") {
      return json(response, { items: folderFixtures });
    }
    if (url.pathname === "/internal/v1/rag/documents") {
      return json(response, { items: [documentFixture] });
    }
    response.writeHead(404).end();
  });

  await new Promise<void>((resolve, reject) => {
    mockApiServer.once("error", reject);
    mockApiServer.listen(MOCK_API_PORT, MOCK_API_HOST, () => resolve());
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    mockApiServer.close((error) => (error ? reject(error) : resolve()));
  });
});

test("70개 canonical route가 Wire Flow 화면, 접근성, 비활성 네트워크 경계를 유지한다", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  expect(registry.screens).toHaveLength(70);
  const selectedScreens = process.env.WIREFLOW_SCREEN_ID
    ? registry.screens.filter((screen) => screen.id === process.env.WIREFLOW_SCREEN_ID)
    : registry.screens;
  expect(selectedScreens.length, "requested Wire Flow screen must exist").toBeGreaterThan(0);
  const seriousViolations: string[] = [];
  const deferredRequests: string[] = [];

  for (const screen of selectedScreens) {
    await prepareAudience(context, screen.audience);
    await page.setViewportSize({
      width: screen.audience === "ADMIN" ? 1280 : 360,
      height: screen.audience === "ADMIN" ? 800 : 800,
    });
    const deferredProbe = screen.status === "PLACEHOLDER" ? collectDeferredRequests(page) : null;

    await page.goto(screen.route);
    if (screen.id === "U-ACCOUNT-003") {
      await expect(page).toHaveURL(/\/survey$/u);
      continue;
    }
    const recoveredSignupStep = screen.id === "AUTH-003" || screen.id === "AUTH-004";
    if (recoveredSignupStep) await expect(page).toHaveURL(/\/signup\/account$/u);
    const screenSurface = page.locator(
      `[data-wireflow-screen="${recoveredSignupStep ? "AUTH-002" : screen.id}"]`,
    );
    await expect(screenSurface).toHaveCount(1);
    await expect(screenSurface).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page, screen.id);

    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    for (const violation of result.violations.filter(
      (item) => item.impact === "serious" || item.impact === "critical",
    )) {
      seriousViolations.push(
        `${screen.id}:${violation.id}:${violation.nodes
          .map((node) => `${node.target.join(" ")} (${node.failureSummary ?? "no summary"})`)
          .join(" | ")}`,
      );
    }

    if (deferredProbe) {
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      );
      deferredProbe.stop();
      deferredRequests.push(...deferredProbe.requests.map((request) => `${screen.id}:${request}`));
    }
  }

  expect(seriousViolations).toEqual([]);
  expect(deferredRequests).toEqual([]);
});

test("관리자 대표 화면은 1280px의 200% 확대에 해당하는 640px reflow에서도 조작 가능하다", async ({
  context,
  page,
}) => {
  await prepareAudience(context, "ADMIN");
  await page.setViewportSize({ width: 640, height: 900 });

  for (const route of ["/admin", "/admin/users", "/admin/users/roles", "/admin/rag"]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page, route);
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
  }
});

async function prepareAudience(
  context: BrowserContext,
  audience: Screen["audience"],
): Promise<void> {
  await context.clearCookies();
  if (audience === "PUBLIC") return;
  await context.addCookies([
    {
      name: ACCESS_COOKIE_NAME,
      value: audience === "ADMIN" ? "admin.payload.signature" : "participant.payload.signature",
      url: WEB_BASE_URL,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
}

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth, `${label} must reflow without page overflow`).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
}

function collectDeferredRequests(page: Page): { requests: string[]; stop: () => void } {
  const requests: string[] = [];
  const listener = (request: import("@playwright/test").Request) => {
    const url = new URL(request.url());
    if (
      request.resourceType() === "websocket" ||
      [
        "/chat/api/",
        "/chat/ws",
        "/subscriptions/",
        "/vote/api/",
        "/admin/tasks/api/",
        "/admin/simulations/api/",
      ].some((prefix) => url.pathname.startsWith(prefix))
    ) {
      requests.push(request.url());
    }
  };
  page.on("request", listener);
  return { requests, stop: () => page.off("request", listener) };
}

function json(response: import("node:http").ServerResponse, body: unknown) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function meResponse(userId: string, role: "PARTICIPANT" | "HIGHEST_ADMIN") {
  return {
    user_id: userId,
    role,
    permissions:
      role === "HIGHEST_ADMIN" ? ["RAG_ADMIN", "CHAT_ADMIN", "VOTE_ADMIN", "SIMULATION_ADMIN"] : [],
    account_state: "ACTIVE",
    must_change_password: false,
  };
}

const profileFixture = {
  user_id: "00000000-0000-4000-8000-000000000001",
  email: "citizen@example.com",
  role: "PARTICIPANT",
  account_state: "ACTIVE",
  preferred_language: "ko",
  rag_answer_detail: "balanced",
  two_factor_enabled: false,
  response_version: 1,
};

const adminUserFixture = {
  user_id: "00000000-0000-4000-8000-000000000002",
  email: "admin@example.com",
  account_state: "ACTIVE",
  roles: ["PARTICIPANT", "ADMIN"],
  permissions: ["RAG_ADMIN", "CHAT_ADMIN", "VOTE_ADMIN", "SIMULATION_ADMIN"],
  row_version: 3,
  must_change_password: false,
  email_verified_at: "2026-08-01T00:00:00Z",
  last_activity_at: "2026-08-12T03:00:00Z",
};

const participantUserFixture = {
  user_id: "00000000-0000-4000-8000-000000000001",
  email: "citizen@example.com",
  account_state: "ACTIVE",
  roles: ["PARTICIPANT"],
  permissions: [],
  row_version: 2,
  must_change_password: false,
  email_verified_at: "2026-08-02T00:00:00Z",
  last_activity_at: "2026-08-12T02:00:00Z",
};

const auditFixture = {
  event_id: "audit-1",
  event_type: "ROLE_CHANGED",
  actor_id: "00000000-0000-4000-8000-000000000002",
  occurred_at: "2026-08-12T03:30:00Z",
  request_id: "request-1",
  subject_id: "00000000-0000-4000-8000-000000000001",
  before_roles: ["PARTICIPANT"],
  after_roles: ["PARTICIPANT", "ADMIN"],
  before_permissions: [],
  after_permissions: ["RAG_ADMIN"],
  reason: "문서 운영 업무 배정",
};

const folderFixtures = [
  { folder_id: "welfare", name: "복지정책", parent_id: null, document_count: 1 },
  { folder_id: "welfare-youth", name: "청년 지원", parent_id: "welfare", document_count: 0 },
];

const documentFixture = {
  document_id: "document-1",
  folder_id: "welfare",
  title: "2026_복지정책_기본계획.pdf",
  status: "READY",
  latest_version_id: "version-1",
  updated_at: "2026-08-12T01:00:00Z",
};
