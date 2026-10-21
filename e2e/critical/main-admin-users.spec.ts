import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { devices, expect, test, type BrowserContext } from "@playwright/test";

const WEB_BASE_URL = "https://localhost:3109";
const MOCK_API_HOST = "127.0.0.1";
const MOCK_API_PORT = 4791;
const ACCESS_COOKIE = "civic_ai_access_token";

let server: Server;
let roleUpdate: { body: Record<string, unknown>; csrf?: string } | null = null;
let adminEndpointCalls = 0;
let pagedDirectory = false;
let directoryRequests: URLSearchParams[] = [];

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
      if (pagedDirectory) {
        directoryRequests.push(url.searchParams);
        if (url.searchParams.get("status") === "admin") {
          return json(response, { items: [adminUser], total: 1, next_cursor: null });
        }
        return url.searchParams.get("cursor") === "page-2"
          ? json(response, { items: [olderUser], total: 3, next_cursor: null })
          : json(response, {
              items: [adminUser, participantUser],
              total: 3,
              next_cursor: "page-2",
            });
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
        roles: ["ADMIN"],
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

test("관리자는 사용자 조회부터 문서 권한 변경과 감사 이력까지 GUI에서 완료한다", async ({
  context,
  page,
}) => {
  roleUpdate = null;
  await authenticate(context, "admin.payload.signature");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/users");

  await expect(page.getByRole("heading", { name: "사용자·권한" })).toBeVisible();
  const participantRow = page.getByRole("row", { name: /citizen@example.com/ });
  await expect(participantRow).toContainText("없음");
  await participantRow.click();

  await expect(page.getByRole("heading", { name: "citizen@example.com" })).toBeVisible();
  await page.getByRole("tab", { name: "권한 편집" }).click();
  const permissionLabels = ["문서 관리", "채팅 관리", "투표 관리", "시뮬레이션 실행·관리"];
  for (const permission of permissionLabels) {
    await expect(page.getByLabel(permission)).toBeVisible();
  }
  await page.getByRole("radio", { name: /^최고 관리자 /u }).check();
  for (const permission of permissionLabels) {
    await expect(page.getByLabel(permission)).toBeChecked();
    await expect(page.getByLabel(permission)).toBeDisabled();
  }
  await expect(page.getByText(/최고 관리자는 모든 운영 권한/)).toBeVisible();

  await page.getByRole("radio", { name: /^사용자 /u }).check();
  for (const permission of permissionLabels) {
    await expect(page.getByLabel(permission)).not.toBeChecked();
    await expect(page.getByLabel(permission)).toBeDisabled();
  }
  await expect(
    page.getByText(/사용자로 저장하면 관리자 역할과 운영 권한이 모두 해제/),
  ).toBeVisible();

  await page.getByRole("radio", { name: /^운영 관리자 /u }).check();
  await page.getByLabel("문서 관리").check();
  await page.getByLabel("변경 사유 (필수)").fill("문서 운영 담당자 배정");
  await expect(page.getByRole("link", { name: "권한 회수 영향 확인" })).toHaveCount(0);
  await page.getByRole("button", { name: "권한 변경 저장" }).click();

  await expect(page.getByRole("status")).toContainText("권한 변경을 저장했습니다");
  expect(roleUpdate).toEqual({
    body: {
      roles: ["ADMIN"],
      permissions: ["RAG_ADMIN"],
      row_version: 2,
      reason: "문서 운영 담당자 배정",
      impact_confirmed: false,
    },
    csrf: "admin-csrf-token",
  });

  await page.getByRole("tab", { name: "권한 이력" }).click();
  await expect(page.getByRole("region", { name: "감사 이력 표" })).toBeVisible();
  await expect(page.getByRole("gridcell", { name: "문서 운영 담당자 배정" })).toBeVisible();
  await expect(page.getByText(/사용자 비활성화|개인정보 삭제 실행/)).toHaveCount(0);
});

test("관리자는 첫 페이지 밖의 사용자를 더 불러오고 상태 필터를 서버에 조회한다", async ({
  context,
  page,
}) => {
  pagedDirectory = true;
  directoryRequests = [];
  try {
    await authenticate(context, "admin.payload.signature");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/users");

    const list = page.getByRole("region", { name: "사용자 목록" });
    await expect(list.getByText("전체 3명 중 2명 표시")).toBeVisible();
    await expect(page.getByRole("row", { name: /early@example.com/ })).toHaveCount(0);

    await page.getByRole("button", { name: "더 불러오기" }).click();
    await expect(page.getByRole("row", { name: /early@example.com/ })).toBeVisible();
    await expect(list.getByText("전체 3명", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "더 불러오기" })).toHaveCount(0);

    await page
      .getByRole("group", { name: "사용자 상태 필터" })
      .getByRole("button", { name: "관리자" })
      .click();
    await expect(list.getByText("전체 1명", { exact: true })).toBeVisible();
    await expect(page.getByRole("row", { name: /early@example.com/ })).toHaveCount(0);

    expect(directoryRequests.map((params) => Object.fromEntries(params))).toEqual([
      { query: "", status: "all", limit: "100" },
      { query: "", status: "all", limit: "100", cursor: "page-2" },
      { query: "", status: "admin", limit: "100" },
    ]);
  } finally {
    pagedDirectory = false;
  }
});

test("터치로 사용자 행을 연속 선택해도 이전 행의 선택 배경이 남지 않는다", async ({ browser }) => {
  const context = await browser.newContext({
    ...devices["Pixel 5"],
    baseURL: WEB_BASE_URL,
    ignoreHTTPSErrors: true,
  });

  try {
    await authenticate(context, "admin.payload.signature");
    const page = await context.newPage();
    await page.goto("/admin/users");

    const rows = page.getByRole("region", { name: "사용자 목록 표" }).locator(".ag-row");
    await expect(rows).toHaveCount(2);

    await rows.nth(0).tap();
    await rows.nth(1).tap();

    await expect
      .poll(() =>
        rows.evaluateAll((items) =>
          items
            .filter((row) => row.classList.contains("is-console-selected"))
            .map((row) => row.getAttribute("row-id")),
        ),
      )
      .toEqual(["00000000-0000-4000-8000-000000000001"]);
  } finally {
    await context.close();
  }
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

const olderUser = {
  user_id: "00000000-0000-4000-8000-000000000003",
  email: "early@example.com",
  account_state: "ACTIVE",
  roles: ["PARTICIPANT"],
  permissions: [],
  row_version: 1,
  must_change_password: false,
  email_verified_at: "2026-01-02T00:00:00Z",
  last_activity_at: "2026-02-12T02:00:00Z",
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
