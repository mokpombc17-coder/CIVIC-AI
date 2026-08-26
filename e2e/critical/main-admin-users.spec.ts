import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { expect, test, type BrowserContext } from "@playwright/test";

const WEB_BASE_URL = "https://localhost:3109";
const MOCK_API_HOST = "127.0.0.1";
const MOCK_API_PORT = 4791;
const ACCESS_COOKIE = "civic_ai_access_token";

let server: Server;
let roleUpdate: { body: Record<string, unknown>; csrf?: string } | null = null;
let adminEndpointCalls = 0;

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${MOCK_API_HOST}:${MOCK_API_PORT}`);
    const cookie = request.headers.cookie ?? "";
    if (url.pathname === "/api/v1/auth/me") {
      if (cookie.includes(`${ACCESS_COOKIE}=admin.payload.signature`)) {
        return json(response, currentUser("00000000-0000-4000-8000-000000000002", "HIGHEST_ADMIN"));
      }
      if (cookie.includes(`${ACCESS_COOKIE}=participant.payload.signature`)) {
        return json(response, currentUser("00000000-0000-4000-8000-000000000001", "PARTICIPANT"));
      }
      response.writeHead(401).end();
      return;
    }
    if (url.pathname === "/api/v1/auth/csrf") {
      return json(response, { csrf_token: "admin-csrf-token" });
    }
    if (url.pathname === "/api/v1/admin/users" && request.method === "GET") {
      adminEndpointCalls += 1;
      if (!cookie.includes(`${ACCESS_COOKIE}=admin.payload.signature`)) {
        return json(
          response,
          { status: 403, code: "FORBIDDEN", detail: "관리자 권한이 필요합니다." },
          403,
        );
      }
      return json(response, { items: [adminUser, participantUser] });
    }
    if (
      url.pathname === "/api/v1/admin/users/00000000-0000-4000-8000-000000000001" &&
      request.method === "GET"
    ) {
      adminEndpointCalls += 1;
      return json(response, participantUser);
    }
    if (
      url.pathname === "/api/v1/admin/users/00000000-0000-4000-8000-000000000001/roles" &&
      request.method === "PUT"
    ) {
      adminEndpointCalls += 1;
      roleUpdate = {
        body: await readBody(request),
        csrf: request.headers["x-csrf-token"] as string | undefined,
      };
      return json(response, {
        ...participantUser,
        roles: ["PARTICIPANT", "ADMIN"],
        permissions: ["RAG_ADMIN"],
        row_version: 3,
      });
    }
    if (url.pathname === "/api/v1/admin/audit") {
      adminEndpointCalls += 1;
      return json(response, { items: [auditEvent] });
    }
    response.writeHead(404).end();
  });
  await listen(server);
});

test.afterAll(async () => close(server));

test("관리자는 사용자 조회부터 RAG 권한 변경과 감사 이력까지 GUI에서 완료한다", async ({
  context,
  page,
}) => {
  roleUpdate = null;
  await authenticate(context, "admin.payload.signature");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/users");

  await expect(page.getByRole("heading", { name: "사용자 목록" })).toBeVisible();
  const participantRow = page.getByRole("row", { name: /citizen@example.com/ });
  await expect(participantRow).toContainText("활성");
  await participantRow.getByRole("link", { name: "사용자 상세" }).click();

  await expect(page.getByRole("heading", { name: "사용자·관리자 상세" })).toBeVisible();
  await expect(page.getByText("citizen@example.com", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "관리자 전환·권한 편집" }).first().click();

  await expect(page.getByRole("heading", { name: "관리자 전환·권한 편집" })).toBeVisible();
  for (const permission of ["RAG 관리", "채팅 관리", "과업·투표 관리", "시뮬레이션 실행·관리"]) {
    await expect(page.getByLabel(permission)).toBeVisible();
  }
  await page.getByLabel("RAG 관리").check();
  await page.getByLabel("변경 사유 (필수)").fill("문서 운영 담당자 배정");
  await page.getByRole("button", { name: "권한 변경 저장" }).click();

  await expect(page.getByRole("status")).toContainText("감사 이벤트를 저장했습니다");
  expect(roleUpdate).toEqual({
    body: {
      roles: ["PARTICIPANT", "ADMIN"],
      permissions: ["RAG_ADMIN"],
      row_version: 2,
      reason: "문서 운영 담당자 배정",
      impact_confirmed: false,
    },
    csrf: "admin-csrf-token",
  });

  await page.getByRole("link", { name: "권한 변경 이력" }).first().click();
  await expect(page.getByRole("heading", { name: "권한 변경 이력" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "문서 운영 담당자 배정" })).toBeVisible();
  await expect(page.getByText(/사용자 비활성화|개인정보 삭제 실행/)).toHaveCount(0);
});

test("참여자 cookie의 관리자 API 호출은 Main/Auth 권한 검사에서 403으로 차단한다", async ({
  context,
  page,
}) => {
  await authenticate(context, "participant.payload.signature");
  await page.goto("/home");
  const before = adminEndpointCalls;

  const result = await page.evaluate(async () => {
    const response = await fetch("/api/v1/admin/users");
    return { status: response.status, body: await response.json() };
  });

  expect(result.status).toBe(403);
  expect(result.body.detail).toBe("관리자 권한이 필요합니다.");
  expect(adminEndpointCalls).toBe(before + 1);
});

async function authenticate(context: BrowserContext, value: string): Promise<void> {
  await context.addCookies([
    {
      name: ACCESS_COOKIE,
      value,
      url: WEB_BASE_URL,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
}

function currentUser(userId: string, role: "PARTICIPANT" | "HIGHEST_ADMIN") {
  return {
    user_id: userId,
    role,
    permissions: role === "HIGHEST_ADMIN" ? ["RAG_ADMIN"] : [],
    account_state: "ACTIVE",
    must_change_password: false,
  };
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function json(response: ServerResponse, body: unknown, status = 200): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function listen(value: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    value.once("error", reject);
    value.listen(MOCK_API_PORT, MOCK_API_HOST, resolve);
  });
}

function close(value: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    value.close((error) => (error ? reject(error) : resolve()));
  });
}

const adminUser = {
  user_id: "00000000-0000-4000-8000-000000000002",
  email: "admin@example.com",
  account_state: "ACTIVE",
  roles: ["PARTICIPANT", "ADMIN"],
  permissions: ["RAG_ADMIN"],
  row_version: 3,
  must_change_password: false,
  email_verified_at: "2026-08-01T00:00:00Z",
  last_activity_at: "2026-08-12T03:00:00Z",
};

const participantUser = {
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

const auditEvent = {
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
  reason: "문서 운영 담당자 배정",
};
