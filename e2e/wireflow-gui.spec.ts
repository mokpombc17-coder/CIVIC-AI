import { createServer, type Server } from "node:http";
import { expect, test, type BrowserContext, type Locator } from "@playwright/test";

const WEB_BASE_URL = "https://localhost:3109";
const MOCK_API_HOST = "127.0.0.1";
const MOCK_API_PORT = 4791;
const ACCESS_COOKIE_NAME = "civic_ai_access_token";

let mockApiServer: Server;

test.beforeAll(async () => {
  mockApiServer = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${MOCK_API_HOST}:${MOCK_API_PORT}`);
    if (url.pathname === "/api/v1/auth/me") {
      const cookie = request.headers.cookie ?? "";
      if (cookie.includes(`${ACCESS_COOKIE_NAME}=participant.payload.signature`)) {
        return json(response, meResponse("00000000-0000-4000-8000-000000000001", "PARTICIPANT"));
      }
      if (cookie.includes(`${ACCESS_COOKIE_NAME}=admin.payload.signature`)) {
        return json(response, meResponse("00000000-0000-4000-8000-000000000002", "HIGHEST_ADMIN"));
      }
      response.writeHead(401).end();
      return;
    }
    if (url.pathname === "/api/v1/auth/csrf") {
      return json(response, { csrf_token: "wireflow-csrf-token" });
    }
    if (url.pathname === "/api/v1/account/profile") {
      return json(response, profileFixture);
    }
    if (url.pathname === "/api/v1/admin/users") {
      return json(response, { items: [adminUserFixture, participantUserFixture] });
    }
    if (url.pathname === "/api/v1/admin/audit") {
      return json(response, { items: [auditFixture] });
    }
    if (url.pathname === "/api/v1/admin/user-labels") {
      return json(response, {
        items: [{ user_id: documentCreatorId, email: "rag-admin@example.com" }],
      });
    }
    if (url.pathname === "/internal/v1/rag/folders") {
      return json(response, { items: folderFixtures });
    }
    if (url.pathname === "/internal/v1/rag/documents") {
      return json(response, { items: [documentFixture] });
    }
    if (url.pathname === "/internal/v1/rag/jobs/job-1") {
      return json(response, {
        job_id: "job-1",
        status: "FAILED",
        progress: 10,
        failure_code: "DOCUMENT_READ_FAILED",
      });
    }
    if (url.pathname === "/internal/v1/rag/jobs/summary") {
      return json(response, {
        active: 0,
        failed: 1,
        counts: { FAILED: 1 },
        recent_failures: [
          {
            job_id: "job-1",
            filename: "policy.pdf",
            failure_code: "DOCUMENT_READ_FAILED",
          },
        ],
      });
    }
    if (url.pathname === "/internal/v1/rag/documents/document-1/versions/version-1/original") {
      response.writeHead(200, {
        "content-type": "application/pdf",
        "content-disposition": "inline; filename=policy.pdf",
      });
      response.end("%PDF-1.4\n%%EOF\n");
      return;
    }
    if (url.pathname === "/internal/v1/rag/queries" && request.method === "POST") {
      return json(response, { job_id: "query-job-1", status: "PENDING" });
    }
    if (url.pathname === "/internal/v1/rag/queries/query-job-1") {
      return json(response, queryResultFixture);
    }
    if (
      /^\/internal\/v1\/rag\/sources\/version-1\/pages\/3\/document\/pages\/\d+\.png$/u.test(
        url.pathname,
      )
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
    mockApiServer.once("error", reject);
    mockApiServer.listen(MOCK_API_PORT, MOCK_API_HOST, () => resolve());
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    mockApiServer.close((error) => (error ? reject(error) : resolve()));
  });
});

test("AUTH-001은 frontend2 Platform Shell 안에서 실제 로그인 UI를 유지한다", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByText("이메일 인증을 완료한 계정으로 접속합니다.")).toHaveCount(0);
  await expect(page.getByRole("heading", { exact: true, name: "로그인" })).toBeVisible();
  await expect(page.getByPlaceholder("name@example.com")).toBeVisible();
  await expect(page.getByPlaceholder("비밀번호 입력")).toBeVisible();
  const shell = page.locator('[data-platform-shell="true"]');
  await expect(shell).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "참여자 주요 메뉴" })).toHaveCount(0);

  const form = page.locator('[data-wireflow-layout="auth-login"] .wf-auth-form');
  const submit = page.getByRole("button", { name: "로그인" });
  const reset = page.locator('[data-wireflow-slot="auth-reset"]');
  const signup = page.locator('[data-wireflow-slot="auth-signup"]');

  await expectBox(shell, { x: [0, 1], y: [0, 1], width: [392, 394], height: [851, 853] });
  await expectBox(form, { x: [16, 18], width: [359, 362], height: [303, 309] });
  await expectBox(submit, { x: [37, 39], width: [317, 320], height: [47, 50] });
  await expectBox(reset, { x: [16, 18], width: [359, 362], height: [118, 122] });
  await expectBox(signup, { x: [16, 18], width: [359, 362], height: [118, 122] });
});

test("AUTH-002 헤더는 Figma node 74:43의 좌표를 유지한다", async ({ page }) => {
  await page.goto("/signup/account");

  const shell = page.locator(".civic-signup-account-shell");
  const header = shell.locator(':scope > [data-platform-shell-surface="true"] > header');
  const back = header.getByRole("link", { name: "이전 화면으로 돌아가기" });
  const title = header.getByRole("heading", { exact: true, name: "회원가입" });

  await expect(shell).toHaveCount(1);
  await expect(back).toBeVisible();
  await expectBox(header, { x: [0, 1], y: [0, 1], width: [392, 394], height: [91, 93] });
  await expectBox(back, { x: [15, 17], y: [11, 13], width: [43, 45], height: [43, 45] });
  await expectBox(title, { x: [71, 73], y: [20, 22], height: [26, 28] });
});

test("U-HOME-001은 별도 브랜드 막대 없이 기준 Wire Flow 카드와 하단 메뉴를 유지한다", async ({
  context,
  page,
}) => {
  await authenticate(context, "participant.payload.signature");
  await page.goto("/home");

  await expect(page.locator(".civic-participant-home-header")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "페이지 전환" })).toHaveCount(0);
  await expect(page.getByRole("heading", { exact: true, name: "CIVIC.AI" })).toBeVisible();
  const shell = page.locator('[data-platform-shell="true"]');
  const navigation = page.getByRole("navigation", { name: "참여자 주요 메뉴" });
  await expect(shell).toHaveCount(1);
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link", { name: "투표" })).toHaveAttribute("href", "/vote");
  await expect(navigation.getByRole("link", { name: "계정" })).toHaveAttribute("href", "/mypage");

  const cards = page.locator('[data-wireflow-layout="participant-home"] .wf-action-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText("문서 질문");
  await expect(cards.nth(0)).toContainText("질문하기");
  await expect(cards.nth(1)).toContainText("주제별 토론");
  await expect(cards.nth(1)).toContainText("토론하기");
  await expect(cards.nth(2)).toContainText("과업 투표");
  await expect(cards.nth(2)).toContainText("투표하기");

  await expectBox(cards.nth(0), {
    x: [16, 18],
    width: [359, 362],
    height: [110, 165],
  });
  await expectBox(cards.nth(1), {
    x: [16, 18],
    width: [359, 362],
    height: [110, 165],
  });
  await expectBox(cards.nth(2), {
    x: [16, 18],
    width: [359, 362],
    height: [110, 165],
  });
  await expectBox(shell, {
    x: [0, 1],
    width: [392, 394],
    height: [851, 853],
  });
  await expectBox(navigation, {
    y: [787, 790],
    width: [392, 394],
    height: [63, 65],
  });
});

test("관리자 로그인 홈은 이름 왼쪽에 관리자·사용자 페이지 전환을 제공한다", async ({
  context,
  page,
}) => {
  await authenticate(context, "admin.payload.signature");
  await page.goto("/home");

  const switcher = page.getByRole("navigation", { name: "페이지 전환" });
  await expect(switcher).toBeVisible();
  const adminPageLink = switcher.getByRole("link", { name: "관리자 페이지로 이동" });
  await expect(adminPageLink).toHaveAttribute("href", "/admin");
  await expect(switcher.getByRole("link", { name: "사용자 페이지로 이동" })).toHaveAttribute(
    "href",
    "/home",
  );
  await expect(switcher.getByRole("link", { name: "사용자 페이지로 이동" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.locator(".civic-header-page-switch + .civic-header-greeting")).toHaveText(
    "citizen님",
  );

  await adminPageLink.click();
  await expect(page).toHaveURL(/\/admin$/u);
  await expect(page.getByRole("heading", { name: "관리 업무" })).toBeVisible();
});

test("U-ACCOUNT는 최신 Wire Flow의 탭·보안 카드·비활성화 dialog를 유지한다", async ({
  context,
  page,
}) => {
  await authenticate(context, "participant.payload.signature");

  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "개인정보·설문 응답" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "계정 설정" })).toBeVisible();
  await expect(
    page.locator('[data-wireflow-layout="account-profile"] .wf-account-card'),
  ).toHaveCount(1);
  await expect(page.getByLabel("선호 언어")).toHaveValue("en");
  await expect(page.getByLabel("답변 상세도")).toHaveValue("detailed");

  await page.goto("/account/security");
  await expect(page.getByRole("heading", { name: "보안 설정" })).toBeVisible();
  await expect(page.getByText("2단계 인증 이메일", { exact: true })).toBeVisible();
  await expect(page.getByText("최근 변경", { exact: true })).toBeVisible();
  await expect(
    page.locator('[data-wireflow-layout="account-security"] .wf-action-card'),
  ).toHaveCount(2);

  await page.goto("/account/deactivate");
  const dialog = page.getByRole("alertdialog", { name: "계정을 비활성화할까요?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("비활성화 영향", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "계정 유지" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "계정 비활성화" })).toBeVisible();
});

test("A-HOME과 A-USER는 최신 Wire Flow 관리자 작업공간을 유지한다", async ({ context, page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await authenticate(context, "admin.payload.signature");

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "관리 업무" })).toBeVisible();
  await expect(page.locator('[data-wireflow-layout="admin-home"] .wf-admin-metric')).toHaveCount(3);
  const adminCards = page.locator('[data-wireflow-layout="admin-home"] .wf-action-card');
  await expect(adminCards).toHaveCount(5);
  const firstAdminCard = await adminCards.nth(0).boundingBox();
  const secondAdminCard = await adminCards.nth(1).boundingBox();
  expect(firstAdminCard).not.toBeNull();
  expect(secondAdminCard).not.toBeNull();
  expect(Math.abs(firstAdminCard!.x - secondAdminCard!.x)).toBeLessThanOrEqual(1);
  expect(firstAdminCard!.width).toBeGreaterThan(1000);
  expect(firstAdminCard!.height).toBeLessThanOrEqual(100);
  await expect(adminCards.nth(0).locator(".wf-badge")).toBeHidden();
  const firstAdminAction = await adminCards.nth(0).locator(".wf-button").boundingBox();
  expect(firstAdminAction).not.toBeNull();
  expect(firstAdminAction!.height).toBeLessThanOrEqual(50);
  expect(
    await adminCards
      .nth(0)
      .locator(".wf-button")
      .evaluate((element) => ({
        borderColor: getComputedStyle(element).borderColor,
        color: getComputedStyle(element).color,
      })),
  ).toEqual({ borderColor: "rgb(40, 108, 244)", color: "rgb(7, 85, 207)" });
  await expectBox(page.locator(".civic-admin-sidebar"), {
    x: [0, 0],
    y: [0, 0],
    width: [238, 242],
    height: [900, 900],
  });
  await expectBox(page.locator('[data-wireflow-screen="A-HOME-001"] .wf-screen-heading'), {
    x: [238, 242],
    y: [0, 0],
    width: [1198, 1202],
    height: [94, 98],
  });

  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "사용자 목록" })).toBeVisible();
  const userFilters = page.getByRole("group", { name: "사용자 상태 필터" });
  await expect(userFilters).toBeVisible();
  await expect(userFilters.getByRole("button", { name: "전체" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    await userFilters
      .getByRole("button", { name: "활성", exact: true })
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe("rgb(255, 255, 255)");
  await expect(page.getByRole("columnheader", { name: "이메일 인증" })).toHaveCount(0);
  await expect(page.getByRole("row", { name: /admin@example.com/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "관리 업무" })).toBeVisible();

  await page.goto("/admin/users/detail?userId=00000000-0000-4000-8000-000000000002");
  await expect(page.getByRole("heading", { name: "사용자·관리자 상세" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "사용자 상세 메뉴" })).toBeVisible();
  await expect(page.locator(".wf-admin-timeline")).toBeVisible();

  await page.goto("/admin/users/roles/revoke?userId=00000000-0000-4000-8000-000000000002");
  const dialog = page.getByRole("alertdialog", { name: "권한을 회수하시겠습니까?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog.getByRole("button", { name: "권한 회수" })).toBeVisible();
});

test("A-RAG-001은 2단 문서 작업공간과 필요 시 여는 미리보기를 제공한다", async ({
  context,
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await authenticate(context, "admin.payload.signature");
  await page.goto("/admin/rag?folderId=welfare");

  await expect(page.getByRole("heading", { name: "문서 관리" })).toBeVisible();
  await expect(page.getByRole("link", { name: "폴더 추가" })).toBeVisible();
  await expect(page.getByRole("link", { name: "폴더 수정" })).toBeVisible();
  await expect(page.getByRole("link", { name: "폴더 삭제" })).toBeVisible();
  await expect(page.getByText("2026_복지정책_기본계획.pdf", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "rag-admin@example.com" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "2026. 8. 12." })).toBeVisible();
  await expect(page.getByRole("cell", { name: "12쪽" })).toBeVisible();
  await expect(page.getByText(documentCreatorId)).toHaveCount(0);

  await expectBox(page.locator(".civic-admin-sidebar"), {
    x: [0, 0],
    y: [0, 0],
    width: [238, 242],
    height: [900, 900],
  });
  await expectBox(page.locator('[data-wireflow-screen="A-RAG-001"] .wf-screen-heading'), {
    x: [238, 242],
    y: [0, 0],
    width: [1198, 1202],
    height: [94, 98],
  });
  await expectBox(page.locator('[data-wireflow-layout="rag-workspace"]'), {
    x: [262, 274],
    y: [118, 130],
    width: [1132, 1154],
  });
  await expect(page.locator('[data-wireflow-layout="rag-workspace"]')).toHaveCSS(
    "grid-template-columns",
    /^250px /,
  );
  for (const heading of [
    page.locator(".civic-folder-tree h2"),
    page.locator(".civic-rag-workspace-heading h2"),
  ]) {
    expect(await heading.evaluate((element) => getComputedStyle(element).fontFamily)).not.toContain(
      "Iowan",
    );
  }
  await expectBox(page.locator(".civic-folder-tree"), { width: [248, 252] });
  await expect(page.locator(".civic-rag-admin-workspace")).toBeVisible();
  await expect(page.locator(".civic-document-inspector")).toHaveCount(0);
  const inlineUpload = page.locator("[data-rag-inline-upload]");
  await expect(inlineUpload).not.toHaveAttribute("open", "");

  await page.getByRole("button", { name: "보기" }).click();

  const inspector = page.getByRole("dialog", { name: "2026_복지정책_기본계획.pdf" });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByText("rag-admin@example.com")).toBeVisible();
  await expect(inspector.getByText("12쪽")).toBeVisible();
  await expect(page.getByTitle("2026_복지정책_기본계획.pdf 미리보기")).toHaveAttribute(
    "src",
    /disposition=inline$/,
  );
});

test("A-RAG-001은 새 폴더 문서 조회가 실패하면 이전 폴더 문서를 즉시 숨긴다", async ({
  context,
  page,
}) => {
  await authenticate(context, "admin.payload.signature");
  await page.goto("/admin/rag?folderId=general");
  const previousDocument = page.getByText("2026_복지정책_기본계획.pdf", { exact: true });
  await expect(previousDocument.first()).toBeVisible();
  await page.route(
    (url) =>
      url.pathname === "/api/v1/rag/documents" && url.searchParams.get("folder_id") === "welfare",
    (route) => route.fulfill({ status: 503, contentType: "application/problem+json", body: "{}" }),
  );

  await page.getByRole("button", { name: "복지정책" }).click();

  await expect(
    page.getByText("문서 작업 공간을 불러오지 못했습니다. 다시 시도해 주세요."),
  ).toBeVisible();
  await expect(previousDocument).toHaveCount(0);
  await expect(page.locator(".civic-document-inspector")).toHaveCount(0);
});

test("A-RAG-001은 처리 상태 자동 갱신 중 기존 문서 표를 유지한다", async ({ context, page }) => {
  await authenticate(context, "admin.payload.signature");

  let folderRequestCount = 0;
  let documentRequestCount = 0;
  let userLabelRequestCount = 0;
  let notifyPollStarted: () => void = () => undefined;
  let releasePollResponse: () => void = () => undefined;
  const pollStarted = new Promise<void>((resolve) => {
    notifyPollStarted = resolve;
  });
  const pollResponseGate = new Promise<void>((resolve) => {
    releasePollResponse = resolve;
  });

  await page.route(
    (url) => url.pathname === "/api/v1/rag/folders",
    (route) => {
      folderRequestCount += 1;
      return route.fulfill({ json: { items: folderFixtures } });
    },
  );
  await page.route(
    (url) => url.pathname === "/api/v1/admin/user-labels",
    (route) => {
      userLabelRequestCount += 1;
      return route.fulfill({
        json: { items: [{ user_id: documentCreatorId, email: "rag-admin@example.com" }] },
      });
    },
  );
  await page.route(
    (url) =>
      url.pathname === "/api/v1/rag/documents" && url.searchParams.get("folder_id") === "welfare",
    async (route) => {
      documentRequestCount += 1;
      const isBackgroundRefresh = documentRequestCount > 1;
      if (isBackgroundRefresh) {
        notifyPollStarted();
        await pollResponseGate;
      }
      await route.fulfill({
        json: {
          items: [
            {
              ...documentFixture,
              active_version: {
                ...documentFixture.active_version,
                status: isBackgroundRefresh ? "ACTIVE" : "PROCESSING",
              },
            },
          ],
          page: 1,
          page_size: 25,
          total: 1,
          total_pages: 1,
          status_counts: { ACTIVE: isBackgroundRefresh ? 1 : 0 },
        },
      });
    },
  );

  await page.goto("/admin/rag?folderId=welfare");
  const documentName = page.getByText("2026_복지정책_기본계획.pdf", { exact: true });
  const documentTable = page.getByRole("region", { name: "RAG 작업 목록 표" });
  await expect(documentName.first()).toBeVisible();
  await expect(page.getByText("상태 확인 중", { exact: true })).toBeVisible();

  try {
    await pollStarted;
    await expect(documentTable).toBeVisible();
    await expect(documentName.first()).toBeVisible();
    expect(folderRequestCount).toBe(1);
    expect(userLabelRequestCount).toBe(1);
  } finally {
    releasePollResponse();
  }

  await expect(page.locator(".civic-job-state", { hasText: "처리 완료" }).first()).toBeVisible();
  expect(documentRequestCount).toBe(2);
  expect(folderRequestCount).toBe(1);
  expect(userLabelRequestCount).toBe(1);
});

test("A-RAG 폴더·업로드·상태·삭제 화면은 최신 Wire Flow 계층을 유지한다", async ({
  context,
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await authenticate(context, "admin.payload.signature");

  await page.goto("/admin/rag/folders?folderId=welfare");
  await expect(page.locator('[data-wireflow-layout="rag-workspace"]')).toBeVisible();
  const folderDialog = page.getByRole("dialog", { name: "폴더 수정" });
  await expect(folderDialog).toBeVisible();
  await expect(folderDialog.getByRole("textbox", { name: "폴더명" })).toHaveValue("복지정책");

  await page.goto("/admin/rag/upload?folderId=welfare&mode=NEW_DOCUMENT");
  await expect(page.getByRole("heading", { name: "복지정책 폴더에 문서 업로드" })).toBeVisible();
  await expect(page.locator('[data-wireflow-layout="rag-upload"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "파일 선택" })).toBeVisible();

  await page.goto("/admin/rag/jobs?jobId=job-1");
  await expect(page.getByRole("heading", { name: "문서 준비 상태" })).toBeVisible();
  await expect(page.locator('[data-wireflow-layout="rag-job-status"]')).toBeVisible();
  await expect(page.getByText("문서 준비 진행 상태", { exact: true })).toBeVisible();
  await expect(page.getByText("policy.pdf", { exact: true })).toBeVisible();
  await expect(page.getByText("문서 읽기 실패", { exact: true })).toBeVisible();
  const jobSteps = page.locator(".civic-job-timeline > li");
  await expect(jobSteps).toHaveCount(3);
  const firstStepBox = await jobSteps.nth(0).boundingBox();
  const secondStepBox = await jobSteps.nth(1).boundingBox();
  expect(firstStepBox).not.toBeNull();
  expect(secondStepBox).not.toBeNull();
  expect(secondStepBox!.y).toBeGreaterThan(firstStepBox!.y + firstStepBox!.height - 1);
  const firstMarkerColor = await jobSteps
    .nth(0)
    .locator(".civic-job-step-marker")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  const failedMarkerColor = await jobSteps
    .nth(1)
    .locator(".civic-job-step-marker")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(firstMarkerColor).not.toBe(failedMarkerColor);
  await expect(page.getByRole("button", { name: "실패 파일 다시 처리" })).toHaveClass(
    /civic-primary-action/,
  );

  await page.goto("/admin/rag/delete?folderId=general&documentId=document-1");
  await expect(page.locator('[data-wireflow-layout="rag-workspace"]')).toBeVisible();
  const deleteDialog = page.getByRole("dialog", { name: "문서를 삭제하시겠습니까?" });
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog.getByText("2026_복지정책_기본계획.pdf", { exact: true })).toBeVisible();
  await expect(deleteDialog.getByRole("button", { name: "문서 삭제" })).toBeDisabled();
});

test("U-RAG-001 질문부터 읽기 전용 PDF까지 기준 GUI와 직결 경계를 유지한다", async ({
  context,
  page,
}) => {
  await authenticate(context, "participant.payload.signature");
  await page.goto("/rag");

  await expect(page.getByRole("heading", { exact: true, name: "AI" })).toBeVisible();
  await expect(page.getByText("궁금한 정보를 질문하세요.")).toBeVisible();
  const shell = page.locator('[data-platform-shell="true"]');
  await expect(shell).toHaveCount(1);
  await expect(page.locator('[data-wireflow-screen="U-RAG-001"] .wf-screen-heading')).toBeHidden();
  await expectBox(shell.locator('[data-platform-shell-surface="true"] > header'), {
    x: [0, 1],
    y: [0, 1],
    width: [392, 394],
    height: [68, 70],
  });

  await page
    .getByPlaceholder("문서에 대해 질문하세요...")
    .fill("복지정책 문서의 핵심 내용을 알려줘.");
  await page.getByRole("button", { name: "질문 전송" }).click();

  await expect(page.getByText("복지정책 문서의 핵심 내용을 알려줘.")).toBeVisible();
  await expect(page.getByText("지원 대상과 신청 기준을 확인할 수 있습니다.")).toBeVisible();
  const citation = page.getByRole("link", { name: "근거 페이지" });
  await expect(citation).toBeVisible();

  await page.reload();
  await expect(page.getByText("복지정책 문서의 핵심 내용을 알려줘.")).toBeVisible();
  await expect(page.getByText("지원 대상과 신청 기준을 확인할 수 있습니다.")).toBeVisible();
  await expect(page.getByRole("link", { name: "근거 페이지" })).toBeVisible();

  await page.getByRole("button", { name: "새 질문" }).click();
  await expect(page.getByText("복지정책 문서의 핵심 내용을 알려줘.")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("복지정책 문서의 핵심 내용을 알려줘.")).toHaveCount(0);

  await page
    .getByPlaceholder("문서에 대해 질문하세요...")
    .fill("복지정책 문서의 핵심 내용을 알려줘.");
  await page.getByRole("button", { name: "질문 전송" }).click();
  await expect(page.getByText("지원 대상과 신청 기준을 확인할 수 있습니다.")).toBeVisible();
  const restoredCitation = page.getByRole("link", { name: "근거 페이지" });
  await expect(restoredCitation).toBeVisible();
  await restoredCitation.click();

  await expect(page).toHaveURL(/\/rag$/);
  await expect(page.getByRole("dialog", { name: "참조 문서" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "2026 복지정책 기본계획" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "2026 복지정책 기본계획 읽기 전용 PDF" }),
  ).toBeVisible();
  await expect(page.locator("a[download], [target='_blank']")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /다운로드|저장/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "다음 페이지" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "이전 페이지" })).toHaveCount(0);
  await expect(page.locator('[data-pdf-scroll-mode="continuous"]')).toHaveCount(1);
  await expect(page.locator(".civic-pdf-page")).toHaveCount(12);
  await expect(page.locator('[data-pdf-page="3"]')).toHaveClass(/is-cited/u);
  await expect(page.getByRole("img", { name: "2026 복지정책 기본계획 3페이지" })).toHaveAttribute(
    "src",
    /\/pages\/3\/document\/pages\/3\.png$/u,
  );
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page).toHaveURL(/\/rag$/);
  await page.getByRole("button", { name: "참조 문서 닫기" }).click();
  await expect(page.getByText("복지정책 문서의 핵심 내용을 알려줘.")).toBeVisible();
});

test("U-RAG-001은 답변 처리 중 새로고침해도 기존 작업을 이어서 완료한다", async ({
  context,
  page,
}) => {
  await authenticate(context, "participant.payload.signature");
  let complete = false;
  await page.route("**/api/v1/rag/queries/query-job-1", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify(
        complete ? queryResultFixture : { job_id: "query-job-1", status: "RUNNING" },
      ),
    });
  });
  await page.goto("/rag");

  await page
    .getByPlaceholder("문서에 대해 질문하세요...")
    .fill("복지정책 문서의 핵심 내용을 알려줘.");
  await page.getByRole("button", { name: "질문 전송" }).click();
  await expect(page.getByText("문서를 검색하고 근거를 확인하고 있습니다.")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("civic:rag-conversation:v1") ?? ""))
    .toContain("query-job-1");

  await page.reload();
  await expect(page.getByText("복지정책 문서의 핵심 내용을 알려줘.")).toBeVisible();
  complete = true;
  await expect(page.getByText("지원 대상과 신청 기준을 확인할 수 있습니다.")).toBeVisible();
});

async function expectBox(
  locator: Locator,
  ranges: Partial<Record<"x" | "y" | "width" | "height", readonly [number, number]>>,
) {
  const box = await locator.boundingBox();
  expect(box, "element must have a rendered bounding box").not.toBeNull();
  for (const [key, range] of Object.entries(ranges) as Array<
    ["x" | "y" | "width" | "height", readonly [number, number]]
  >) {
    expect(box?.[key], `${key} must stay inside the Wire Flow tolerance`).toBeGreaterThanOrEqual(
      range[0],
    );
    expect(box?.[key], `${key} must stay inside the Wire Flow tolerance`).toBeLessThanOrEqual(
      range[1],
    );
  }
}

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
  preferred_language: "en",
  rag_answer_detail: "detailed",
  two_factor_enabled: true,
  response_version: 3,
};

const adminUserFixture = {
  user_id: "00000000-0000-4000-8000-000000000002",
  email: "admin@example.com",
  account_state: "ACTIVE",
  roles: ["PARTICIPANT", "ADMIN"],
  permissions: ["RAG_ADMIN", "CHAT_ADMIN", "VOTE_ADMIN", "SIMULATION_ADMIN"],
  row_version: 4,
  must_change_password: false,
  email_verified_at: "2026-08-11T01:00:00Z",
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
  email_verified_at: "2026-08-10T01:00:00Z",
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
  reason: "문서 운영 담당 지정",
};

const folderFixtures = [
  { folder_id: "root", parent_id: null, name: "문서", kind: "ROOT" },
  { folder_id: "general", parent_id: "root", name: "정책자료", kind: "GENERAL" },
  { folder_id: "welfare", parent_id: "general", name: "복지정책", kind: "NORMAL" },
];

const documentCreatorId = "640af5c5-d302-4c32-97ca-c9db40ed22e5";

const documentFixture = {
  document_id: "document-1",
  folder_id: "welfare",
  filename: "2026_복지정책_기본계획.pdf",
  created_by: documentCreatorId,
  created_at: "2026-08-12T03:30:00Z",
  deleted: false,
  active_version: {
    document_version_id: "version-1",
    document_id: "document-1",
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

const queryResultFixture = {
  job_id: "query-job-1",
  status: "SUCCEEDED",
  submitted_question: "복지정책 문서의 핵심 내용을 알려줘.",
  answer: "지원 대상과 신청 기준을 확인할 수 있습니다.",
  citations: [
    {
      document_version_id: "version-1",
      page_number: 3,
      page_count: 12,
      source_object_sha256: "a".repeat(64),
      title: "2026 복지정책 기본계획",
    },
  ],
};
