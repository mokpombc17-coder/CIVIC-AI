import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const WEB_BASE_URL = "https://localhost:3110";
const MOCK_API_HOST = "127.0.0.1";
const MOCK_API_PORT = 4792;
const ACCESS_COOKIE = "civic_ai_access_token";
const ACTUAL_QUERY_ID = "11111111-1111-4111-8111-111111111111";
const CITATION_VERSION_ID = "30000000-0000-4000-8000-000000000003";
const evidenceRoot = path.resolve(process.cwd(), "../../artifacts/release-evidence/browser");

let mock: Server;

test.beforeAll(async () => {
  mkdirSync(evidenceRoot, { recursive: true });
  mock = createServer((request, response) => {
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
      return json(response, { csrf_token: "actual-browser-csrf" });
    }
    if (url.pathname === "/api/v1/account/profile") return json(response, profile);
    if (url.pathname === "/api/v1/admin/users") {
      return json(response, { items: [adminUser, participantUser] });
    }
    if (url.pathname === "/api/v1/admin/audit") return json(response, { items: [audit] });
    if (url.pathname === "/api/v1/admin/user-labels") {
      return json(response, {
        items: [{ user_id: documentCreatorId, email: "rag-admin@example.com" }],
      });
    }
    if (url.pathname === "/internal/v1/rag/folders") {
      return json(response, { items: folders });
    }
    if (url.pathname === "/internal/v1/rag/documents") {
      return json(response, { items: [document] });
    }
    if (url.pathname === "/internal/v1/rag/queries" && request.method === "POST") {
      return json(response, { job_id: ACTUAL_QUERY_ID, status: "PENDING" });
    }
    if (url.pathname === "/internal/v1/rag/stream-session" && request.method === "POST") {
      return json(response, { stream_path: `/stream/rag/queries/${ACTUAL_QUERY_ID}` });
    }
    if (url.pathname === `/internal/v1/rag/queries/${ACTUAL_QUERY_ID}/events`) {
      void streamQueryEvents(response);
      return;
    }
    if (url.pathname === `/internal/v1/rag/queries/${ACTUAL_QUERY_ID}`) {
      return json(response, queryResult);
    }
    if (
      url.pathname.startsWith(
        `/internal/v1/rag/sources/${CITATION_VERSION_ID}/pages/3/document/pages/`,
      ) &&
      url.pathname.endsWith(".png")
    ) {
      response.writeHead(200, { "content-type": "image/png" });
      response.end(
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nLkAAAAASUVORK5CYII=",
          "base64",
        ),
      );
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve, reject) => {
    mock.once("error", reject);
    mock.listen(MOCK_API_PORT, MOCK_API_HOST, resolve);
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    mock.close((error) => (error ? reject(error) : resolve()));
  });
});

test("@chrome installed Chrome: 로그인, 홈, RAG 인용·원문 GUI", async ({
  browser,
  context,
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 394, height: 852 });
  await page.goto("/login");
  await expect(page.locator('[data-wireflow-screen="AUTH-001"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();

  await authenticate(context, "participant.payload.signature");
  await page.goto("/home");
  await expect(page.locator('[data-wireflow-screen="U-HOME-001"]').first()).toBeVisible();
  await expectNoOverflow(page);

  await page.goto("/rag");
  await page.getByRole("button", { name: "새 질문" }).click();
  await page
    .getByRole("alertdialog", { name: "새 질문을 시작할까요?" })
    .getByRole("button", { name: "새 질문 시작" })
    .click();
  await expect(page.getByText("새 질문을 시작했습니다.")).toBeVisible();
  await page
    .getByPlaceholder("궁금한 내용을 입력해 주세요")
    .fill("복지정책 문서의 핵심 내용을 알려줘.");
  await page.getByRole("button", { name: "질문 전송" }).click();
  const progress = page.getByRole("status", { name: "RAG 답변 생성 중" });
  await expect(progress).toBeVisible();
  await expect(progress).toContainText(/중\.\.\.$/u);
  await expect(progress.locator("ol")).toHaveCount(0);
  await expect(progress.getByRole("progressbar")).toHaveCount(0);
  const streamedAnswer = page.getByLabel("실시간 답변");
  await expect(streamedAnswer).toContainText("지원 대상과 ");
  await expect(streamedAnswer).not.toContainText("신청 기준을 확인할 수 있습니다.");
  await expect(streamedAnswer).toContainText("지원 대상과 신청 기준을 확인할 수 있습니다.");
  await expect(page.getByText("지원 대상과 신청 기준을 확인할 수 있습니다.")).toBeVisible();
  await expect(page.locator(".civic-rag-citation-card")).toHaveCount(0);
  await page.getByRole("button", { name: "출처 2026 복지정책 기본계획 p.3 열기" }).click();
  await expect(page).toHaveURL(/\/rag$/);
  await expect(page.locator('[data-wireflow-screen="U-RAG-001"]')).toBeVisible();
  await expect(page.getByRole("dialog", { name: "참조 문서" })).toBeVisible();
  await expect(page.locator('[data-pdf-scroll-mode="continuous"]')).toHaveCount(1);
  await expect(page.locator('[data-pdf-zoom-mode="pinch"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: "다음 페이지" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "이전 페이지" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "문서 확대/축소 도구" })).toHaveCount(0);
  await expect(page.getByText("전체 12페이지 · 인용 3페이지", { exact: true })).toBeVisible();
  await expect(page.locator(".wf-rag-document-card")).toHaveCSS("border-top-width", "0px");
  await expect
    .poll(() =>
      page.locator(".wf-rag-document-card").evaluate((card) => {
        const canvas = card.querySelector<HTMLElement>(".civic-pdf-canvas");
        const meta = card.querySelector<HTMLElement>(".wf-rag-document-meta");
        if (!canvas || !meta) return false;
        return meta.getBoundingClientRect().top >= canvas.getBoundingClientRect().bottom;
      }),
    )
    .toBe(true);
  await expect(page.getByText("연속 스크롤", { exact: true })).toHaveCount(0);
  await expect
    .poll(() =>
      page.locator(".civic-pdf-canvas").evaluate((canvas) => getComputedStyle(canvas).touchAction),
    )
    .toMatch(/pinch-zoom|manipulation/u);
  await expect(page.getByRole("img", { name: "2026 복지정책 기본계획 3페이지" })).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await record(page, browser.version(), "chrome", testInfo.project.name);
});

test("@edge installed Edge: 관리자 사용자·RAG와 200% 동등 reflow GUI", async ({
  browser,
  context,
  page,
}, testInfo) => {
  await authenticate(context, "admin.payload.signature");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/users");
  await expect(page.locator('[data-wireflow-screen="A-USER-001"]')).toBeVisible();
  await expect(page.getByRole("row", { name: /citizen@example.com/ })).toBeVisible();

  await page.goto("/admin/rag?folderId=welfare");
  await expect(page.locator('[data-wireflow-screen="A-RAG-001"]')).toBeVisible();
  await expect(page.getByText("2026_복지정책_기본계획.pdf", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "rag-admin@example.com" })).toBeVisible();
  await expect(page.getByText(documentCreatorId)).toHaveCount(0);

  await page.setViewportSize({ width: 640, height: 900 });
  await expectNoOverflow(page);
  await expectRagWorkspaceToReflow(page);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await record(page, browser.version(), "edge", testInfo.project.name);
});

async function authenticate(context: BrowserContext, value: string) {
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

async function expectNoOverflow(page: Page) {
  const size = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.client + 1);
}

async function expectRagWorkspaceToReflow(page: Page) {
  const layout = page.locator(
    '[data-wireflow-screen="A-RAG-001"] [data-wireflow-layout="rag-workspace"]',
  );
  const panels = layout.locator(":scope > .civic-folder-tree, :scope > .civic-rag-admin-workspace");

  await expect(layout).toHaveCSS("grid-template-columns", /^\d+(?:\.\d+)?px$/);
  await expect(panels).toHaveCount(2);

  const boxes = await panels.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, top: box.top, width: box.width };
    }),
  );
  expect(boxes.every((box) => box.width >= 560)).toBe(true);
  expect(boxes[1].top).toBeGreaterThan(boxes[0].top);
  expect(
    Math.max(...boxes.map((box) => box.left)) - Math.min(...boxes.map((box) => box.left)),
  ).toBeLessThanOrEqual(1);
}

async function record(page: Page, version: string, name: string, project: string) {
  const screenshot = path.join(evidenceRoot, `${name}-wireflow.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  const checksum = createHash("sha256")
    .update(await import("node:fs/promises").then(({ readFile }) => readFile(screenshot)))
    .digest("hex");
  writeFileSync(
    path.join(evidenceRoot, `${name}-result.json`),
    `${JSON.stringify(
      {
        schema_version: 1,
        browser: name === "chrome" ? "Google Chrome" : "Microsoft Edge",
        version,
        project,
        executed_at: new Date().toISOString(),
        status: "PASS",
        viewport: name === "chrome" ? "394x852" : "1440x900 and 640x900 reflow",
        screenshot: path.relative(path.resolve(process.cwd(), "../.."), screenshot),
        screenshot_checksum: `sha256:${checksum}`,
      },
      null,
      2,
    )}\n`,
    { mode: 0o644 },
  );
}

function json(response: import("node:http").ServerResponse, body: unknown) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function streamQueryEvents(response: import("node:http").ServerResponse) {
  response.writeHead(200, {
    "cache-control": "no-cache",
    connection: "keep-alive",
    "content-type": "text/event-stream",
  });
  writeSseEvent(response, "query.progress", {
    status: "RUNNING",
    stage: "UNDERSTANDING",
    label: "질문의 맥락을 이해하고 있어요",
    detail: "질문의 의도와 이전 대화 맥락을 안전하게 정리합니다.",
    progress_percent: 12,
    estimated_remaining_seconds: 8,
    elapsed_seconds: 1,
  });
  await delay(300);
  writeSseEvent(response, "query.progress", {
    status: "RUNNING",
    stage: "SEARCHING",
    label: "관련 문서를 찾고 있어요",
    detail: "키워드와 의미를 함께 비교해 관련 자료를 좁힙니다.",
    progress_percent: 32,
    estimated_remaining_seconds: 7,
    elapsed_seconds: 2,
  });
  await delay(300);
  writeSseEvent(response, "query.progress", {
    status: "RUNNING",
    stage: "READING",
    label: "근거가 될 페이지를 읽고 있어요",
    detail: "문서 구조와 표를 확인해 답변에 사용할 근거를 선별합니다.",
    progress_percent: 55,
    estimated_remaining_seconds: 6,
    elapsed_seconds: 3,
  });
  await delay(300);
  writeSseEvent(response, "query.progress", {
    status: "RUNNING",
    stage: "COMPOSING",
    label: "문서 근거로 답변을 작성하고 있어요",
    detail: "선별된 근거만 사용해 이해하기 쉬운 답변을 구성합니다.",
    progress_percent: 76,
    estimated_remaining_seconds: 4,
    elapsed_seconds: 4,
  });
  await delay(300);
  writeSseEvent(response, "query.answer.started", { status: "STREAMING" });
  writeSseEvent(response, "query.answer.delta", { status: "STREAMING", delta: "지원 대상과 " });
  await delay(700);
  writeSseEvent(response, "query.answer.delta", {
    status: "STREAMING",
    delta: "신청 기준을 확인할 수 있습니다.",
  });
  await delay(700);
  writeSseEvent(response, "query.succeeded", { status: "SUCCEEDED" });
  response.end();
}

function writeSseEvent(response: import("node:http").ServerResponse, event: string, data: unknown) {
  if (response.destroyed) return;
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function currentUser(userId: string, role: "PARTICIPANT" | "HIGHEST_ADMIN") {
  return {
    user_id: userId,
    role,
    permissions:
      role === "HIGHEST_ADMIN" ? ["RAG_ADMIN", "CHAT_ADMIN", "VOTE_ADMIN", "SIMULATION_ADMIN"] : [],
    account_state: "ACTIVE",
    must_change_password: false,
  };
}

const profile = {
  user_id: "00000000-0000-4000-8000-000000000001",
  email: "citizen@example.com",
  role: "PARTICIPANT",
  account_state: "ACTIVE",
  preferred_language: "ko",
  rag_answer_detail: "balanced",
  two_factor_enabled: true,
  response_version: 3,
};
const adminUser = {
  user_id: "00000000-0000-4000-8000-000000000002",
  email: "admin@example.com",
  account_state: "ACTIVE",
  roles: ["PARTICIPANT", "ADMIN"],
  row_version: 3,
};
const participantUser = {
  user_id: "00000000-0000-4000-8000-000000000001",
  email: "citizen@example.com",
  account_state: "ACTIVE",
  roles: ["PARTICIPANT"],
  row_version: 2,
};
const audit = {
  event_id: "audit-1",
  event_type: "ROLE_CHANGED",
  actor_id: "00000000-0000-4000-8000-000000000002",
  occurred_at: "2026-08-12T03:30:00Z",
  request_id: "request-1",
};
const folders = [
  { folder_id: "root", parent_id: null, name: "문서", kind: "ROOT" },
  { folder_id: "welfare", parent_id: "root", name: "복지정책", kind: "NORMAL" },
];
const documentCreatorId = "640af5c5-d302-4c32-97ca-c9db40ed22e5";
const document = {
  document_id: "document-1",
  folder_id: "welfare",
  filename: "2026_복지정책_기본계획.pdf",
  created_by: documentCreatorId,
  created_at: "2026-08-12T03:30:00Z",
  deleted: false,
  active_version: {
    document_version_id: "version-1",
    version_number: 1,
    filename: "2026_복지정책_기본계획.pdf",
    media_type: "application/pdf",
    source_object_sha256: "a".repeat(64),
    source_bytes: 2_621_440,
    page_count: 12,
    created_at: "2026-08-12T03:30:00Z",
    activated_at: "2026-08-12T03:31:00Z",
    status: "READY",
  },
};
const queryResult = {
  job_id: ACTUAL_QUERY_ID,
  status: "SUCCEEDED",
  submitted_question: "복지정책 문서의 핵심 내용을 알려줘.",
  answer: `지원 대상과 신청 기준을 확인할 수 있습니다. [${CITATION_VERSION_ID}#3]`,
  citations: [
    {
      document_version_id: CITATION_VERSION_ID,
      page_number: 3,
      page_count: 12,
      source_object_sha256: "a".repeat(64),
      title: "2026 복지정책 기본계획",
    },
  ],
};
