import { createServer, type Server } from "node:http";
import { expect, test, type BrowserContext, type Locator } from "@playwright/test";
import { voteSurveyCurrentFixture, voteSurveyLatestFixture } from "./fixtures/vote-survey";

const WEB_BASE_URL = process.env.CIVIC_E2E_WEB_BASE_URL ?? "https://localhost:3109";
const MOCK_API_HOST = "127.0.0.1";
const MOCK_API_PORT = Number(process.env.CIVIC_E2E_ADMIN_MOCK_PORT ?? "4791");
const ACCESS_COOKIE_NAME = "civic_ai_access_token";

const pendingChatRequestFixture = {
  creationRequestId: "chat-request-1",
  requesterUserId: "chat-requester-1",
  name: "지역 교통 토론방",
  description: "지역 교통 정책의 개선 방향을 논의합니다.",
  categoryIds: [],
  visibility: "LISTED",
  joinPolicy: "OPEN",
  status: "PENDING",
  requestedAt: "2026-08-30T01:00:00Z",
  resolvedAt: null,
  roomId: null,
  ownerMembershipId: null,
  roomVersion: null,
  ownerMembershipVersion: null,
  rejectionReason: null,
  replayed: false,
};

let mockApiServer: Server;
let twoFactorEnabled = true;
let twoFactorEnableRequested = false;
let twoFactorEnableRequestBodies: Record<string, unknown>[] = [];
let serviceEligibilityDelayMs = 0;
let serviceEligibilityRequired = false;

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
    if (url.pathname === "/api/v1/signup/flows" && request.method === "POST") {
      return json(response, {
        flow_id: "wireflow-signup-flow",
        documents: {
          TERMS: {
            document_id: "TERMS",
            document_version: "2",
            body_sha256: "0".repeat(64),
            path: "/legal/terms/2",
          },
          ACCOUNT_RAG_PRIVACY: {
            document_id: "ACCOUNT_RAG_PRIVACY",
            document_version: "2",
            body_sha256: "1".repeat(64),
            path: "/legal/required-service-information/2",
          },
        },
      });
    }
    if (
      url.pathname === "/api/v1/signup/flows/wireflow-signup-flow/complete" &&
      request.method === "POST"
    ) {
      return json(response, { next: "LOGIN" }, 201);
    }
    if (url.pathname === "/api/v1/signup/verification/verify" && request.method === "POST") {
      response.writeHead(204).end();
      return;
    }
    if (url.pathname === "/api/v1/auth/password-reset/request" && request.method === "POST") {
      response.writeHead(202).end();
      return;
    }
    if (url.pathname === "/api/v1/auth/password-reset/complete" && request.method === "POST") {
      response.writeHead(204).end();
      return;
    }
    if (url.pathname === "/api/v1/account/profile") {
      return json(response, { ...profileFixture, two_factor_enabled: twoFactorEnabled });
    }
    if (url.pathname === "/api/v1/me/surveys/current" && request.method === "GET") {
      return json(response, voteSurveyCurrentFixture);
    }
    if (url.pathname === "/api/v1/me/service-eligibility" && request.method === "GET") {
      const eligibility = {
        activeRoundId: voteSurveyCurrentFixture.round.id,
        capabilities: serviceEligibilityRequired
          ? ["SUBMIT_CURRENT_SURVEY", "VIEW_CURRENT_SURVEY", "VIEW_OWN_SURVEY_RESPONSES"]
          : ["VIEW_CURRENT_SURVEY", "VIEW_OWN_SURVEY_RESPONSES"],
        eligible: !serviceEligibilityRequired,
        evaluatedAt: "2026-09-02T00:00:00Z",
        nextAction: serviceEligibilityRequired ? "COMPLETE_CURRENT_SURVEY" : null,
        reason: serviceEligibilityRequired ? "CURRENT_SURVEY_RESPONSE_REQUIRED" : null,
        surveyRequirement: serviceEligibilityRequired ? "REQUIRED" : "SATISFIED",
      };
      if (serviceEligibilityDelayMs > 0) {
        setTimeout(() => json(response, eligibility), serviceEligibilityDelayMs);
        return;
      }
      return json(response, eligibility);
    }
    if (url.pathname === "/api/v1/me/survey-responses/latest" && request.method === "GET") {
      return json(response, voteSurveyLatestFixture);
    }
    if (url.pathname === "/api/v1/account/2fa/enable" && request.method === "POST") {
      void readJsonBody(request)
        .then((body) => {
          twoFactorEnableRequestBodies.push(body);
          if (!twoFactorEnableRequested) {
            twoFactorEnableRequested = true;
            json(response, { next: "EMAIL_CODE" }, 202);
            return;
          }
          if (body.code !== "123456") {
            json(response, { detail: "인증 코드가 올바르지 않습니다." }, 400);
            return;
          }
          twoFactorEnabled = true;
          response.writeHead(204).end();
        })
        .catch(() => json(response, { detail: "요청 본문을 읽지 못했습니다." }, 400));
      return;
    }
    if (url.pathname === "/api/v1/admin/users") {
      return json(response, { items: [adminUserFixture, participantUserFixture] });
    }
    if (url.pathname === "/api/v1/admin/audit") {
      return json(response, { items: [auditFixture] });
    }
    if (url.pathname === "/api/v1/admin/user-labels") {
      return json(response, {
        items: [
          { user_id: documentCreatorId, email: "rag-admin@example.com" },
          { user_id: "chat-requester-1", email: "citizen@example.com" },
        ],
      });
    }
    if (url.pathname === "/api/v1/admin/room-creation-requests" && request.method === "GET") {
      return json(response, {
        items: [pendingChatRequestFixture],
        nextCursor: null,
        hasNext: false,
      });
    }
    if (url.pathname === "/api/v1/admin/room-creation-requests/chat-request-1") {
      return json(response, pendingChatRequestFixture);
    }
    if (url.pathname === "/internal/v1/rag/folders") {
      return json(response, { items: folderFixtures });
    }
    if (url.pathname === "/internal/v1/rag/folders/welfare" && request.method === "DELETE") {
      response.writeHead(204).end();
      return;
    }
    if (url.pathname === "/internal/v1/rag/documents") {
      if (url.searchParams.get("status") === "PROCESSING") {
        return json(response, { items: [processingDocumentFixture], total: 1 });
      }
      if (url.searchParams.get("status") === "PENDING") {
        return json(response, { items: [], total: 0 });
      }
      return json(response, { items: [documentFixture] });
    }
    if (url.pathname === "/internal/v1/rag/documents/document-1" && request.method === "DELETE") {
      response.writeHead(204).end();
      return;
    }
    if (url.pathname === "/internal/v1/rag/jobs/job-1") {
      return json(response, {
        job_id: "job-1",
        document_id: "document-1",
        upload_cancel_allowed: true,
        status: "FAILED",
        progress: 10,
        failure_code: "DOCUMENT_READ_FAILED",
      });
    }
    if (url.pathname === "/internal/v1/rag/jobs/job-1/retry" && request.method === "POST") {
      return json(response, { job_id: "job-retry-1", status: "QUEUED" }, 202);
    }
    if (url.pathname === "/internal/v1/rag/jobs/job-retry-1") {
      return json(response, {
        job_id: "job-retry-1",
        status: "QUEUED",
        progress: 0,
      });
    }
    if (url.pathname === "/internal/v1/rag/jobs/job-retry-wait-1") {
      return json(response, {
        job_id: "job-retry-wait-1",
        document_id: "document-retry-wait-1",
        upload_cancel_allowed: true,
        status: "RETRY_WAIT",
        progress: 10,
      });
    }
    if (
      url.pathname === "/internal/v1/rag/jobs/job-retry-wait-1/cancel-upload" &&
      request.method === "POST"
    ) {
      response.writeHead(204).end();
      return;
    }
    if (url.pathname === "/internal/v1/rag/jobs/summary") {
      return json(response, {
        active: 0,
        failed: 1,
        counts: { FAILED: 1 },
        recent_failures: [
          {
            job_id: "job-1",
            document_id: "document-1",
            filename: "policy.pdf",
            failure_code: "DOCUMENT_READ_FAILED",
            updated_at: "2026-08-29T10:00:00Z",
          },
        ],
      });
    }
    if (url.pathname === "/api/v1/admin/simulation-billing/wallet") {
      return json(response, {
        balanceKrw: 100_000,
        heldKrw: 12_000,
        availableKrw: 88_000,
        spentTodayKrw: 2_700,
        updatedAt: "2026-08-29T10:00:00Z",
      });
    }
    if (url.pathname === "/api/v1/admin/simulation-tasks") {
      return json(response, [currentSimulationTaskFixture]);
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

test.beforeEach(() => {
  twoFactorEnabled = true;
  twoFactorEnableRequested = false;
  twoFactorEnableRequestBodies = [];
  serviceEligibilityDelayMs = 0;
  serviceEligibilityRequired = false;
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
  await expectBox(reset, { x: [16, 18], width: [174, 177], height: [47, 50] });
  await expectBox(signup, { x: [202, 204], width: [174, 177], height: [47, 50] });
});

test("AUTH-002 헤더는 모바일 공통 높이로 본문과 분리된다", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/signup/account");

  const shell = page.locator(".civic-signup-account-shell");
  const header = shell.locator(':scope > [data-platform-shell-surface="true"] > header');
  const back = header.getByRole("link", { name: "이전 화면으로 돌아가기" });
  const title = header.getByRole("heading", { exact: true, name: "회원가입" });

  await expect(shell).toHaveCount(1);
  await expect(back).toBeVisible();
  await expectBox(header, { x: [0, 1], y: [0, 1], width: [392, 394], height: [63, 65] });
  await expectBox(back, { x: [15, 17], y: [9, 11], width: [43, 45], height: [43, 45] });
  await expectBox(title, { x: [71, 73], y: [18, 20], height: [26, 28] });
});

test("가입은 계정 정보·이메일 인증·약관 동의 3단계와 유동 모바일 폭을 유지한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/signup/account");

  const step = page.getByRole("navigation", { name: "회원가입 단계" });
  const form = page.locator('[data-wireflow-layout="auth-flow"] form.wf-auth-form');
  const count = step.locator(":scope > p > strong");
  const stepTitle = step.locator(":scope > p > span");
  const submit = form.getByRole("button", { name: "인증 코드 받기" });

  await expectBox(step, {
    x: [15.5, 16.5],
    y: [79.5, 80.5],
    width: [360.5, 361.5],
    height: [65, 66],
  });
  await expectBox(form, {
    x: [15.5, 16.5],
    y: [161, 162],
    width: [360.5, 361.5],
    height: [502, 503],
  });
  await expectBox(submit, { x: [36.5, 37.5], width: [318.5, 319.5], height: [47.5, 48.5] });
  await expect(count).toHaveCSS("font-size", "13px");
  await expect(count).toHaveCSS("font-weight", "700");
  await expect(stepTitle).toHaveCSS("font-size", "16px");
  await expect(stepTitle).toHaveCSS("font-weight", "700");
  await expect(form.locator(".civic-field").first()).toHaveCSS("font-size", "15px");

  for (const width of [320, 360, 393, 430]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/signup/account");
    await expect(page.getByRole("navigation", { name: "회원가입 단계" })).toBeVisible();

    await expectBox(page.getByRole("navigation", { name: "회원가입 단계" }), {
      x: [15.5, 16.5],
      width: [width - 32.5, width - 31.5],
    });
    const responsiveForm = page.locator('[data-wireflow-layout="auth-flow"] form.wf-auth-form');
    await expect(responsiveForm).toBeVisible();
    await expectBox(responsiveForm, {
      x: [15.5, 16.5],
      width: [width - 32.5, width - 31.5],
    });
    await expectBox(page.getByRole("button", { name: "인증 코드 받기" }), {
      x: [36.5, 37.5],
      width: [width - 74.5, width - 73.5],
    });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }

  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/signup/account");
  await page.getByRole("textbox", { name: "이메일" }).fill("wireflow@example.com");
  await page.getByLabel("비밀번호", { exact: true }).fill("Wireflow1!");
  await page.getByLabel("비밀번호 확인").fill("Wireflow1!");
  await page.getByRole("checkbox", { name: "만 14세 이상입니다" }).check();
  await page.getByRole("button", { name: "인증 코드 받기" }).click();
  await expect(page.locator('[data-wireflow-screen="AUTH-005"]')).toBeVisible();
  await expect(page.getByRole("navigation", { name: "회원가입 단계" })).toContainText(
    "2/3이메일 인증",
  );
  await expect(page.getByLabel("선호 언어")).toHaveCount(0);
  await expect(page.getByLabel("AI 답변 상세도")).toHaveCount(0);
  await expect(page.locator('.civic-step-indicator li[aria-current="step"]')).toHaveCSS(
    "height",
    "8px",
  );

  await page.getByRole("textbox", { name: "인증 코드" }).fill("123456");
  await page.getByRole("button", { name: "인증하기" }).click();
  await expect(page.locator('[data-wireflow-screen="AUTH-004"]')).toBeVisible();
  await expect(page.getByRole("navigation", { name: "회원가입 단계" })).toContainText(
    "3/3약관 동의·필수정보",
  );
  const termsLabel = page.locator(".civic-consent-item .civic-check > span").first();
  await expect(termsLabel).toContainText("이용약관에 동의합니다");
  await expect(termsLabel).toHaveCSS("font-size", "15px");
  await expect(termsLabel).toHaveCSS("font-weight", "700");
  await expect(termsLabel).toHaveCSS("line-height", "22.5px");
});

test("AUTH-007·008은 이메일 입력 단계를 건너뛰고 Figma 비밀번호 재설정 흐름을 유지한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/login");
  await page.getByLabel("이메일").fill("name@example.com");
  await page.getByRole("button", { name: "비밀번호 재설정" }).click();

  await expect(page).toHaveURL(/\/password-reset$/u);
  await expect(page.getByRole("heading", { name: "비밀번호 재설정" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "등록 이메일" })).toHaveCount(0);
  const codeForm = page.locator('[data-wireflow-screen="AUTH-007"] .wf-auth-form');
  const codeSupport = page.locator('[data-wireflow-screen="AUTH-007"] .wf-auth-info');
  await expect(codeForm).toContainText("na***@example.com으로 코드를 전송했습니다.");
  await expectBox(codeForm, {
    x: [15.5, 16.5],
    y: [84.5, 85.5],
    width: [360.5, 361.5],
    height: [270, 272],
  });
  await expectBox(codeSupport, {
    x: [15.5, 16.5],
    y: [375, 377],
    width: [360.5, 361.5],
    height: [184, 186],
  });
  await expect(codeForm.getByRole("heading", { name: "인증 코드 입력" })).toHaveCSS(
    "font-size",
    "18px",
  );
  await expect(codeForm.getByLabel("6자리 인증 코드")).toHaveCSS("font-size", "16px");

  await codeForm.getByLabel("6자리 인증 코드").fill("111222");
  await codeForm.getByRole("button", { name: "인증하기" }).click();

  await expect(page).toHaveURL(/\/password-reset\/complete$/u);
  const passwordForm = page.locator('[data-wireflow-screen="AUTH-008"] .wf-auth-form');
  const passwordSupport = page.locator('[data-wireflow-screen="AUTH-008"] .wf-auth-info');
  await expect(passwordForm.getByLabel("6자리 인증 코드")).toHaveValue("111222");
  await expectBox(passwordForm, {
    x: [15.5, 16.5],
    y: [84.5, 85.5],
    width: [360.5, 361.5],
    height: [446, 447],
  });
  await expectBox(passwordSupport, {
    x: [15.5, 16.5],
    y: [547, 548],
    width: [360.5, 361.5],
    height: [205, 207],
  });

  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 852 });
    await page.reload();
    await expect(passwordForm).toBeVisible();
    await expectBox(passwordForm, {
      x: [15.5, 16.5],
      width: [width - 32.5, width - 31.5],
    });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});

test("U-HOME-001은 별도 브랜드 막대 없이 기준 Wire Flow 카드와 하단 메뉴를 유지한다", async ({
  context,
  page,
}) => {
  await authenticate(context, "participant.payload.signature");
  await page.goto("/home");

  await expect(page.locator(".civic-participant-home-header")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "페이지 전환" })).toHaveCount(0);
  await expect(page.locator(".civic-brand-title")).toHaveText("CIVIC.AI");
  await expect(page.locator(".civic-region-badge")).toHaveText("광주/전남");
  const shell = page.locator('[data-platform-shell="true"]');
  const navigation = page.getByRole("navigation", { name: "참여자 주요 메뉴" });
  await expect(shell).toHaveCount(1);
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link", { name: "투표" })).toHaveAttribute("href", "/vote");
  await expect(navigation.getByRole("link", { name: "계정" })).toHaveAttribute("href", "/mypage");

  const cards = page.locator('[data-wireflow-layout="participant-home"] .wf-action-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText("어떤 점부터 짚어볼까요?");
  await expect(cards.nth(0)).toContainText("질문하기");
  await expect(cards.nth(1)).toContainText("서로 오가는 이야기");
  await expect(cards.nth(1)).toContainText("토론하기");
  await expect(cards.nth(2)).toContainText("논의에 보태는 내 의견");
  await expect(cards.nth(2)).toContainText("투표하기");

  const welcomeCard = page.locator(".wf-home-welcome");
  await expect(welcomeCard).not.toHaveAttribute("data-pwa-install-trigger");
  const badgeStyles = await page
    .locator(".civic-region-badge, .wf-home-welcome .wf-badge")
    .evaluateAll((badges) =>
      badges.map((badge) => {
        const style = getComputedStyle(badge);
        return {
          backgroundColor: style.backgroundColor,
          borderRadius: style.borderRadius,
          color: style.color,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          height: style.height,
          lineHeight: style.lineHeight,
          padding: style.padding,
        };
      }),
    );
  expect(badgeStyles).toHaveLength(2);
  expect(badgeStyles[0]).toEqual(badgeStyles[1]);
  const userMenuTrigger = page.getByRole("button", { name: "citizen님 사용자 메뉴" });
  await userMenuTrigger.click();
  const userMenu = page.getByRole("group", { name: "사용자 메뉴" });
  await expect(userMenu).toBeVisible();
  await userMenuTrigger.hover();
  await expect(userMenuTrigger).toHaveCSS("color", "rgb(31, 33, 36)");
  await expect(page.locator(".civic-header-user-chevron")).toHaveCSS("transition-duration", "0s");
  await expect(userMenu.getByText("관리자 페이지", { exact: true })).toHaveCount(0);
  const installAction = userMenu.getByRole("button", { name: "앱 설치" });
  const logoutAction = userMenu.getByRole("button", { name: "로그아웃" });
  await expect(installAction).toBeVisible();
  await expect(installAction).toBeDisabled();
  await expect(installAction).toHaveCSS("color", "rgb(154, 161, 172)");
  await expect(logoutAction).toBeVisible();
  await page.evaluate(() => {
    const state = window as typeof window & { __pwaInstallPromptCalls?: number };
    state.__pwaInstallPromptCalls = 0;
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperties(event, {
      prompt: {
        value: async () => {
          state.__pwaInstallPromptCalls = (state.__pwaInstallPromptCalls ?? 0) + 1;
        },
      },
      userChoice: {
        value: Promise.resolve({ outcome: "accepted", platform: "web" }),
      },
    });
    window.dispatchEvent(event);
  });
  await expect(installAction).toBeEnabled();
  await installAction.hover();
  await expect(installAction).toHaveCSS("background-color", "rgb(245, 246, 248)");
  await expect(installAction).toHaveCSS("color", "rgb(31, 33, 36)");
  await expect(logoutAction).toHaveCSS("color", "rgb(31, 33, 36)");
  await expect(userMenu.getByRole("separator")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(userMenu).toHaveCount(0);
  await expect(userMenuTrigger).toBeFocused();

  await userMenuTrigger.click();
  await installAction.click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __pwaInstallPromptCalls?: number }).__pwaInstallPromptCalls,
      ),
    )
    .toBe(1);
  await expect(userMenu).toHaveCount(0);
  await expect(welcomeCard.getByRole("button")).toHaveCount(0);

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

test("관리자 로그인 홈은 사용자 팝업에서 관리자 페이지 이동을 제공한다", async ({
  context,
  page,
}) => {
  await authenticate(context, "admin.payload.signature");
  await page.goto("/home");

  await expect(page.getByRole("navigation", { name: "페이지 전환" })).toHaveCount(0);
  const userMenuTrigger = page.getByRole("button", { name: "citizen님 사용자 메뉴" });
  await expect(userMenuTrigger).toBeVisible();
  await userMenuTrigger.click();

  const userMenu = page.getByRole("group", { name: "사용자 메뉴" });
  await expect(userMenu).toBeVisible();
  const adminPageLink = userMenu.getByRole("link", { name: "관리자 페이지" });
  await expect(adminPageLink).toHaveAttribute("href", "/admin");
  await expect(userMenu.getByRole("button", { name: "로그아웃" })).toBeVisible();
  await expect(userMenu.getByRole("separator")).toHaveCount(0);

  await adminPageLink.click();
  await expect(page).toHaveURL(/\/admin$/u);
  await expect(page.getByRole("heading", { name: "관리 홈" })).toBeVisible();
});

test("U-ACCOUNT는 Figma 계정 허브·정보 관리·설문·비활성화 dialog를 유지한다", async ({
  context,
  page,
}) => {
  await authenticate(context, "participant.payload.signature");

  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "계정" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "계정 항목" })).toBeVisible();
  await expect(page.getByRole("link", { name: /내 정보 관리/u })).toBeVisible();
  await expect(page.getByRole("link", { name: /내 설문 보기/u })).toBeVisible();
  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();
  const accountCards = page.locator(".wf-account-hub-card");
  await expect(accountCards).toHaveCount(2);
  const accountCardLayout = await accountCards.evaluateAll((cards) =>
    cards.map((card) => {
      const box = card.getBoundingClientRect();
      const style = getComputedStyle(card);
      return {
        height: Math.round(box.height),
        paddingBlock: `${style.paddingTop} ${style.paddingBottom}`,
      };
    }),
  );
  expect(accountCardLayout).toEqual([
    { height: 78, paddingBlock: "12px 12px" },
    { height: 78, paddingBlock: "12px 12px" },
  ]);

  await page.goto("/account/profile");
  await expect(page.getByRole("heading", { name: "내 정보 관리" })).toBeVisible();
  await expect(page.getByText("회원정보 수정", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("선호 언어")).toHaveCount(0);
  await expect(page.getByLabel("AI 답변 상세도")).toHaveCount(0);
  await expect(page.getByText("비밀번호 변경", { exact: true })).toBeVisible();
  await expect(page.getByText("2단계 인증", { exact: true })).toBeVisible();
  await expect(page.getByText("서비스 이용 동의", { exact: true })).toHaveCount(0);
  const passwordCard = page.locator(".wf-account-security-card").filter({
    hasText: "비밀번호 변경",
  });
  const passwordAction = passwordCard.getByRole("button", { name: "변경하기" });
  await passwordAction.scrollIntoViewIfNeeded();
  const accountScroller = page.locator('[data-platform-shell-content="true"]');
  const scrollTopBeforePasswordForm = await accountScroller.evaluate((element) =>
    Math.round(element.scrollTop),
  );
  await passwordAction.click();
  const currentPassword = page.getByLabel("현재 비밀번호");
  await expect(currentPassword).toBeVisible();
  await expect(currentPassword).toBeFocused();
  await expect
    .poll(() => accountScroller.evaluate((element) => Math.round(element.scrollTop)))
    .toBeGreaterThan(scrollTopBeforePasswordForm);
  const securityForm = page.locator(".wf-security-form");
  const readFormOffsetFromScroller = () =>
    securityForm.evaluate((form) => {
      const scroller = form.closest('[data-platform-shell-content="true"]');
      if (!scroller) return Number.POSITIVE_INFINITY;
      return Math.round(form.getBoundingClientRect().top - scroller.getBoundingClientRect().top);
    });
  await expect.poll(readFormOffsetFromScroller).toBeLessThanOrEqual(24);
  const formOffsetFromScroller = await readFormOffsetFromScroller();
  expect(formOffsetFromScroller).toBeGreaterThanOrEqual(0);
  const accountManagement = page.getByRole("heading", { name: "계정 관리" });
  await accountManagement.scrollIntoViewIfNeeded();
  await expect(accountManagement).toBeVisible();
  const profileUrl = page.url();
  await page.getByRole("button", { name: "계정 비활성화" }).click();
  await expect(page).toHaveURL(profileUrl);
  await expect(page.getByLabel("화면을 불러오는 중")).toHaveCount(0);
  const dialog = page.getByRole("alertdialog", { name: "계정을 비활성화할까요?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("비활성화 영향", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("비밀번호 확인")).toBeFocused();
  await expectBox(dialog, { width: [359, 362] });
  await expectBox(dialog.locator(".wf-impact-list > div").first(), { height: [93, 95] });
  await expectBox(dialog.locator(".wf-impact-list > div").last(), { height: [74, 76] });
  const dialogTypography = await dialog.evaluate(async (element) => {
    await document.fonts.ready;
    const heading = element.querySelector("h2");
    const description = element.querySelector(":scope > p");
    if (!heading || !description) throw new Error("dialog typography missing");
    const headingStyle = getComputedStyle(heading);
    const descriptionStyle = getComputedStyle(description);
    return {
      fontLoaded: document.fonts.check('16px "Pretendard GOV"'),
      fontFamily: headingStyle.fontFamily,
      headingFontSize: headingStyle.fontSize,
      headingLineHeight: headingStyle.lineHeight,
      descriptionFontSize: descriptionStyle.fontSize,
      descriptionLineHeight: descriptionStyle.lineHeight,
    };
  });
  expect(dialogTypography).toEqual({
    fontLoaded: true,
    fontFamily: '"Pretendard GOV", Pretendard, "Apple SD Gothic Neo", sans-serif',
    headingFontSize: "24px",
    headingLineHeight: "32.4px",
    descriptionFontSize: "15px",
    descriptionLineHeight: "22.5px",
  });
  await dialog.getByRole("button", { name: "계정 유지" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(profileUrl);

  await page.goto("/account/survey");
  await expect(page).toHaveURL(/\/survey$/u);
});

test("이관 전 설문 주소는 returnTo를 보존해 3001의 /survey로 넘긴다", async ({ context, page }) => {
  await authenticate(context, "participant.payload.signature");
  await page.goto("/mypage/survey?returnTo=%2Frag%3FfolderId%3Dwelfare");

  await expect(page).toHaveURL(/\/survey\?returnTo=%2Frag%3FfolderId%3Dwelfare$/u);
});

test("필수 설문 미제출 참여자는 공통 Guard가 원래 목적지를 보존해 /survey로 보낸다", async ({
  context,
  page,
}) => {
  serviceEligibilityRequired = true;
  await authenticate(context, "participant.payload.signature");

  await page.goto("/home?source=eligibility-guard");

  await expect(page).toHaveURL(/\/survey\?returnTo=%2Fhome%3Fsource%3Deligibility-guard$/u);
});

test("자격 확인이 늦으면 Platform Shell을 유지하고 지연 indicator를 안정적으로 표시한다", async ({
  context,
  page,
}) => {
  serviceEligibilityDelayMs = 250;
  await authenticate(context, "participant.payload.signature");
  await page.addInitScript(() => {
    const state = window as typeof window & {
      __eligibilityLoadingTimings?: { hiddenAt?: number; shownAt?: number };
    };
    state.__eligibilityLoadingTimings = {};
    const observer = new MutationObserver(() => {
      const timings = state.__eligibilityLoadingTimings;
      if (!timings) return;
      const indicator = document.querySelector('[data-eligibility-loading-indicator="true"]');
      if (indicator && timings.shownAt === undefined) timings.shownAt = performance.now();
      if (!indicator && timings.shownAt !== undefined && timings.hiddenAt === undefined) {
        timings.hiddenAt = performance.now();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });

  await page.goto("/home?source=eligibility-loading", { waitUntil: "domcontentloaded" });

  const shells = page.locator('[data-platform-shell="true"]');
  const shell = shells.last();
  const navigation = page.getByRole("navigation", { name: "참여자 주요 메뉴" }).last();
  const indicator = page.locator('[data-eligibility-loading-indicator="true"]');
  await expect(shell).toBeVisible();
  await expect(navigation).toBeVisible();
  await expect(page.locator('[data-wireflow-layout="participant-home"]')).toHaveCount(0);
  await expect(indicator).toHaveCount(0);
  await expect(indicator).toBeVisible();
  await expect(page.getByText("이용 자격 확인 중…", { exact: true })).toBeVisible();
  await expect(indicator).toHaveCount(0);
  await expect(
    page.locator('[data-wireflow-layout="participant-home"] .wf-action-card'),
  ).toHaveCount(3);
  await expect(shells).toHaveCount(1);

  const timings = await page.evaluate(() => {
    const state = window as typeof window & {
      __eligibilityLoadingTimings?: { hiddenAt?: number; shownAt?: number };
    };
    return state.__eligibilityLoadingTimings;
  });
  expect(timings?.shownAt).toBeGreaterThanOrEqual(200);
  expect((timings?.hiddenAt ?? 0) - (timings?.shownAt ?? 0)).toBeGreaterThanOrEqual(180);
});

test("참여자 Platform Shell 헤더는 자격 확인 전후와 주요 경로에서 64px을 유지한다", async ({
  context,
  page,
}) => {
  serviceEligibilityDelayMs = 1_000;
  await authenticate(context, "participant.payload.signature");

  const shell = page.locator('[data-platform-shell="true"]').last();
  const headerHeight = () =>
    shell
      .locator("header")
      .first()
      .evaluate((element) => element.getBoundingClientRect().height);

  await page.goto("/rag", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-eligibility-loading="true"]')).toBeVisible();
  expect(await headerHeight()).toBe(64);

  await expect(page.locator('[data-wireflow-screen="U-RAG-001"]')).toBeVisible();
  expect(await headerHeight()).toBe(64);

  serviceEligibilityDelayMs = 0;
  await page.goto("/mypage");
  await expect(page.locator('[data-wireflow-screen="U-ACCOUNT-001"]')).toBeVisible();
  expect(await headerHeight()).toBe(64);

  await page.goto("/home");
  await expect(page.locator('[data-wireflow-layout="participant-home"]')).toBeVisible();
  expect(await headerHeight()).toBe(64);
});

test("RAG 대화에서는 메시지 목록만 세로 스크롤을 소유한다", async ({ context, page }) => {
  await authenticate(context, "participant.payload.signature");
  await page.goto("/rag");

  const shellContent = page.locator('[data-platform-shell-content="true"]');
  const messages = page.locator(".civic-rag-messages");
  await expect(page.locator('[data-wireflow-screen="U-RAG-001"]')).toBeVisible();
  await expect(shellContent).toHaveAttribute("data-scroll", "child");
  await expect(shellContent).toHaveCSS("overflow-y", "hidden");

  await messages.evaluate((element) => {
    const filler = document.createElement("div");
    filler.dataset.ragScrollFixture = "true";
    filler.style.height = "1600px";
    filler.style.flex = "none";
    element.append(filler);
  });

  const dimensions = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('[data-platform-shell-content="true"]');
    const messageList = document.querySelector<HTMLElement>(".civic-rag-messages");
    if (!shell || !messageList) throw new Error("RAG scroll containers are missing.");
    messageList.scrollTop = 200;
    return {
      messageClientHeight: messageList.clientHeight,
      messageScrollHeight: messageList.scrollHeight,
      messageScrollTop: messageList.scrollTop,
      shellClientHeight: shell.clientHeight,
      shellScrollHeight: shell.scrollHeight,
      shellScrollTop: shell.scrollTop,
    };
  });

  expect(dimensions.messageScrollHeight).toBeGreaterThan(dimensions.messageClientHeight);
  expect(dimensions.messageScrollTop).toBeGreaterThan(0);
  expect(dimensions.shellScrollHeight).toBeLessThanOrEqual(dimensions.shellClientHeight + 1);
  expect(dimensions.shellScrollTop).toBe(0);
});

test("RAG와 계정 루트 헤더의 뒤로 가기는 홈으로 이동한다", async ({ context, page }) => {
  await authenticate(context, "participant.payload.signature");

  for (const route of ["/rag", "/mypage"]) {
    await page.goto(route);
    const back = page.getByRole("link", { name: "이전 화면으로 돌아가기" });
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("href", "/home");
    await back.click();
    await expect(page).toHaveURL(/\/home$/u);
    await expect(page.locator('[data-wireflow-layout="participant-home"]')).toBeVisible();
  }
});

test("참여자 하단 메뉴는 소유 앱에 따라 client/document navigation을 나눈다", async ({
  context,
  page,
}) => {
  await authenticate(context, "participant.payload.signature");
  await page.goto("/home");
  await page.evaluate(() => {
    (window as typeof window & { __platformNavigationMarker?: string }).__platformNavigationMarker =
      "preserved";
  });

  await page.getByRole("link", { name: "AI", exact: true }).click();

  await expect(page).toHaveURL(/\/rag$/u);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __platformNavigationMarker?: string })
          .__platformNavigationMarker,
    ),
  ).toBe("preserved");

  await page.getByRole("link", { name: "토론방", exact: true }).click();

  await expect(page).toHaveURL(/\/chat$/u);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __platformNavigationMarker?: string })
          .__platformNavigationMarker,
    ),
  ).toBeUndefined();
});

test("U-ACCOUNT 2단계 인증은 코드 발송 후 6자리 코드를 확인한다", async ({ context, page }) => {
  twoFactorEnabled = false;
  await authenticate(context, "participant.payload.signature");
  await page.goto("/account/profile");

  const twoFactorCard = page.locator(".wf-account-security-card").filter({
    hasText: "2단계 인증",
  });
  await expect(twoFactorCard).toContainText(
    "로그인할 때 비밀번호 입력 후 이메일로 받은 6자리 코드를 추가로 확인합니다.",
  );
  await twoFactorCard.getByRole("button", { name: "설정하기" }).click();
  await expect(page.getByLabel("6자리 인증 코드")).toHaveCount(0);

  await page.getByRole("button", { name: "인증 코드 받기" }).click();
  await expect(page.getByText("인증코드가 전송되었습니다.", { exact: true })).toBeVisible();
  const codeInput = page.getByLabel("6자리 인증 코드");
  await expect(codeInput).toBeVisible();
  await expect(codeInput).toBeFocused();
  await expect(codeInput).toHaveAttribute("autocomplete", "one-time-code");
  await expect(codeInput).toHaveAttribute("inputmode", "numeric");
  await expect(codeInput).toHaveAttribute("maxlength", "6");
  await codeInput.fill("123456");
  await page.getByRole("button", { name: "인증 확인" }).click();

  await expect(twoFactorCard.getByRole("button", { name: "해제하기" })).toBeVisible();
  expect(twoFactorEnableRequestBodies).toEqual([{ code: null }, { code: "123456" }]);
});

test("A-HOME은 채팅방 승인 대기 목록에서 검토 화면으로 이동한다", async ({ context, page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await authenticate(context, "admin.payload.signature");

  await page.goto("/admin");
  const pendingChatRequests = page.getByRole("region", { name: "채팅방 승인 대기" });
  await expect(pendingChatRequests.getByText("지역 교통 토론방", { exact: true })).toBeVisible();
  await expect(pendingChatRequests.getByText(/citizen@example\.com/)).toBeVisible();
  const reviewChatRequest = pendingChatRequests.getByRole("link", {
    name: "지역 교통 토론방 검토하기",
  });
  await expect(reviewChatRequest).toHaveCSS("justify-self", "end");
  await reviewChatRequest.click();

  await expect(page).toHaveURL(/\/admin\/chat\/requests\/detail\?requestId=chat-request-1$/u);
  await expect(page.getByRole("heading", { name: "채팅방 생성 요청 검토" })).toBeVisible();
});

test("A-HOME과 A-USER는 최신 Wire Flow 관리자 작업공간을 유지한다", async ({ context, page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await authenticate(context, "admin.payload.signature");

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "관리 홈" })).toBeVisible();
  await expect(page.locator('[data-wireflow-layout="admin-home"] .wf-admin-metric')).toHaveCount(4);
  const adminCards = page.locator('[data-wireflow-layout="admin-home"] .wf-action-card');
  await expect(adminCards).toHaveCount(0);
  await expect(page.getByText("시뮬레이션 사용 잔액", { exact: true })).toBeVisible();
  await expect(page.getByText("88,000원", { exact: true })).toBeVisible();
  await expect(page.getByText("24시간 내 마감", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/실행 보류/u)).toHaveCount(0);
  const currentOperations = page.getByRole("region", { name: "현재 처리 중" });
  await expect(currentOperations.getByText("2건", { exact: true })).toBeVisible();
  await expect(currentOperations.getByText("지역 교통정책 조사", { exact: true })).toBeVisible();
  await expect(
    currentOperations.getByText("2026_복지정책_처리중.pdf", { exact: true }),
  ).toBeVisible();
  await expect(currentOperations.getByText("68%", { exact: true })).toBeVisible();
  await expect(currentOperations.getByText("72%", { exact: true })).toBeVisible();
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
    height: [78, 82],
  });

  const retryLink = page.getByRole("link", { name: "policy.pdf 재시도" });
  await expect(retryLink).toHaveAttribute(
    "href",
    "/admin/rag/upload?retryJobId=job-1&documentId=document-1&filename=policy.pdf",
  );
  const retryRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/v1/rag/jobs/job-1/retry",
  );
  await retryLink.click();
  const retryRequest = await retryRequestPromise;
  expect(retryRequest.headers()["idempotency-key"]).toBe("ADMIN_HOME_RETRY:job-1");
  await expect(page).toHaveURL(/\/admin\/rag\/jobs\?jobId=job-retry-1&filename=policy\.pdf$/u);
  await expect(page.getByRole("heading", { name: "문서 준비 상태" })).toBeVisible();

  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "사용자·권한" })).toBeVisible();
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
  await expect(page.getByLabel("이메일 검색")).toBeVisible();
  await expect(page.getByRole("link", { name: "관리 업무" })).toHaveCount(0);

  await page.goto("/admin/users/detail?userId=00000000-0000-4000-8000-000000000002");
  await expect(page.getByRole("heading", { name: "사용자·권한" })).toBeVisible();
  await expect(page.getByRole("tablist", { name: "사용자 상세 탭" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "개요" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "활동" })).toBeVisible();

  await page.goto("/admin/users/roles/revoke?userId=00000000-0000-4000-8000-000000000002");
  await expect(page).toHaveURL(/\/admin\/users\/roles\/revoke\?userId=/u);

  await expect(page.getByRole("tab", { name: "권한 편집" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
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
    height: [63, 65],
  });
  await expectBox(page.locator('[data-wireflow-layout="rag-workspace"]'), {
    x: [239, 241],
    y: [63, 65],
    width: [1199, 1201],
    height: [835, 837],
  });
  await expect(page.locator('[data-wireflow-layout="rag-workspace"]')).toHaveCSS(
    "grid-template-columns",
    /^220px /,
  );
  for (const heading of [
    page.locator(".civic-folder-tree h2"),
    page.locator(".civic-rag-workspace-heading h2"),
  ]) {
    expect(await heading.evaluate((element) => getComputedStyle(element).fontFamily)).not.toContain(
      "Iowan",
    );
  }
  await expectBox(page.locator(".civic-folder-tree"), { width: [218, 222] });
  await expect(page.locator(".civic-rag-admin-workspace")).toBeVisible();
  await expect(page.locator(".civic-document-inspector")).toHaveCount(0);
  const inlineUpload = page.locator("[data-rag-inline-upload]");
  await expect(inlineUpload).not.toHaveAttribute("open", "");
  const documentRowsScroller = page.locator(".civic-document-ledger > .civic-table-scroll");
  await expect(page.locator('[data-wireflow-layout="rag-workspace"]')).toHaveCSS(
    "overflow",
    "hidden",
  );
  await expect(documentRowsScroller).toHaveCSS("overflow-y", "auto");
  await expect(page.locator(".civic-folder-tree ul")).toHaveCSS("overflow", "visible");
  expect(
    await page.evaluate(() => document.body.scrollHeight > document.body.clientHeight + 1),
  ).toBe(false);

  const documentRow = page.getByRole("row", { name: /2026_복지정책_기본계획\.pdf/u });
  await expect(documentRow.getByRole("button", { name: "미리보기" })).toBeVisible();
  const documentMenu = documentRow.locator('summary[aria-label$="추가 작업"]');
  await documentMenu.click();
  await expect(documentRow.getByRole("link", { name: "문서 삭제" })).toBeVisible();
  await documentMenu.click();
  await documentRow.getByRole("button", { name: "미리보기" }).click();

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

  await page.goto("/admin/rag/folders?folderId=welfare&mode=DELETE");
  const folderDeleteDialog = page.getByRole("dialog", { name: "폴더 삭제 확인" });
  await expect(folderDeleteDialog).toBeVisible();
  await expect(folderDeleteDialog.getByText("포함 문서 1개", { exact: true })).toBeVisible();
  await expect(folderDeleteDialog.getByText("포함 문서 확인 중", { exact: true })).toHaveCount(0);
  await folderDeleteDialog.getByRole("button", { name: "폴더 삭제 확인" }).click();
  await expect(page).toHaveURL(/\/admin\/rag\?folderId=general$/u);
  await expect(folderDeleteDialog).toHaveCount(0);

  await page.goto("/admin/rag/upload?folderId=welfare&mode=NEW_DOCUMENT");
  await expect(page.getByRole("heading", { name: "복지정책 폴더에 문서 업로드" })).toBeVisible();
  await expect(page.locator('[data-wireflow-layout="rag-upload"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "파일 선택" })).toBeVisible();
  const uploadInput = page.locator('[data-wireflow-layout="rag-upload"] input[type="file"]');
  await expect(uploadInput).toHaveAttribute("multiple", "");
  await uploadInput.setInputFiles([
    { name: "첫번째.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") },
    { name: "두번째.docx", mimeType: "application/zip", buffer: Buffer.from("PK") },
  ]);
  await expect(page.getByRole("button", { name: "첫번째.pdf 업로드 목록에서 제거" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "두번째.docx 업로드 목록에서 제거" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "첫번째.pdf 업로드 목록에서 제거" }).click();
  await expect(page.getByRole("button", { name: "첫번째.pdf 업로드 목록에서 제거" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "두번째.docx 업로드 목록에서 제거" }),
  ).toBeVisible();

  await page.goto("/admin/rag/jobs?jobId=job-1");
  await expect(page.getByRole("heading", { name: "문서 준비 상태" })).toBeVisible();
  await expect(page.locator('[data-wireflow-layout="rag-job-status"]')).toBeVisible();
  await expect(page.getByText("문서 준비 진행 상태", { exact: true })).toBeVisible();
  await expect(page.getByText("policy.pdf", { exact: true })).toBeVisible();
  await expect(page.locator(".civic-job-file-mark .civic-file-icon")).toBeVisible();
  await expect(page.locator(".civic-job-file-mark")).toContainText("PDF");
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
  await expect(page.getByRole("button", { name: "업로드 취소" })).toHaveClass(
    /civic-danger-action/,
  );
  await expect(page.getByRole("button", { name: "상태 새로고침" })).toHaveCount(0);
  const cancellationRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "DELETE" &&
      new URL(request.url()).pathname === "/api/v1/rag/documents/document-1" &&
      new URL(request.url()).searchParams.get("failed_job_id") === "job-1",
  );
  await page.getByRole("button", { name: "업로드 취소" }).click();
  const uploadCancelDialog = page.getByRole("alertdialog", { name: "업로드를 취소할까요?" });
  await expect(uploadCancelDialog).toBeVisible();
  await expect(
    uploadCancelDialog.getByText("실패한 업로드를 취소하면 이 문서와 처리 결과가 삭제됩니다.", {
      exact: true,
    }),
  ).toBeVisible();
  await uploadCancelDialog.getByRole("button", { name: "업로드 취소" }).click();
  const cancellationRequest = await cancellationRequestPromise;
  expect(cancellationRequest.headers()["idempotency-key"]).toBeTruthy();
  await expect(page).toHaveURL(/\/admin\/rag$/u);

  await page.goto(
    "/admin/rag/jobs?jobId=job-retry-wait-1&filename=downloads-02.hwpx&folderId=general",
  );
  await expect(page.locator(".civic-job-status-badge", { hasText: "재시도 대기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "업로드 취소" })).toBeVisible();
  const retryWaitCancellationRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/v1/rag/jobs/job-retry-wait-1/cancel-upload",
  );
  await page.getByRole("button", { name: "업로드 취소" }).click();
  const retryWaitUploadCancelDialog = page.getByRole("alertdialog", {
    name: "업로드를 취소할까요?",
  });
  await expect(retryWaitUploadCancelDialog).toBeVisible();
  await expect(
    retryWaitUploadCancelDialog.getByText(
      "대기 중인 업로드를 취소하면 이 문서와 준비 중인 처리 결과가 삭제됩니다.",
      { exact: true },
    ),
  ).toBeVisible();
  await retryWaitUploadCancelDialog.getByRole("button", { name: "업로드 취소" }).click();
  const retryWaitCancellationRequest = await retryWaitCancellationRequestPromise;
  expect(retryWaitCancellationRequest.headers()["idempotency-key"]).toBeTruthy();
  await expect(page).toHaveURL(/\/admin\/rag\?folderId=general$/u);

  await page.goto("/admin/rag/delete?folderId=general&documentId=document-1");
  await expect(page.locator('[data-wireflow-layout="rag-workspace"]')).toBeVisible();
  const deleteDialog = page.getByRole("dialog", { name: "문서를 삭제하시겠습니까?" });
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog.getByText("2026_복지정책_기본계획.pdf", { exact: true })).toBeVisible();
  await expect(deleteDialog.getByRole("button", { name: "문서 삭제" })).toBeDisabled();
  await deleteDialog.getByLabel("삭제 후 되돌릴 수 없음을 확인했습니다.").check();
  await deleteDialog.getByRole("button", { name: "문서 삭제" }).click();
  await expect(page).toHaveURL(/\/admin\/rag\?folderId=general$/u);
  await expect(deleteDialog).toHaveCount(0);
});

test("U-RAG-001 질문부터 읽기 전용 문서까지 기준 GUI와 직결 경계를 유지한다", async ({
  context,
  page,
}) => {
  await authenticate(context, "participant.payload.signature");
  await page.goto("/rag");

  await expect(page.getByRole("heading", { exact: true, name: "AI" })).toBeVisible();
  await expect(page.getByText("궁금한 내용을 AI에게 질문해 보세요.")).toBeVisible();
  await expect(page.getByText("등록된 자료를 바탕으로 근거와 함께 답변해 드려요.")).toBeVisible();
  await expect(page.locator(".civic-rag-session-bar")).toHaveCSS(
    "background-color",
    "rgb(244, 247, 255)",
  );
  const shell = page.locator('[data-platform-shell="true"]');
  await expect(shell).toHaveCount(1);
  await expect(page.locator('[data-wireflow-screen="U-RAG-001"] .wf-screen-heading')).toBeHidden();
  await expectBox(shell.locator('[data-platform-shell-surface="true"] > header'), {
    x: [0, 1],
    y: [0, 1],
    width: [392, 394],
    height: [63, 65],
  });
  await expectBox(page.locator('[data-wireflow-screen="U-RAG-001"] .civic-rag-composer'), {
    x: [16, 18],
    y: [674, 678],
    width: [359, 362],
    height: [96, 100],
  });
  await expectBox(page.getByRole("navigation", { name: "참여자 주요 메뉴" }), {
    y: [788, 790],
    height: [63, 65],
  });

  await page
    .getByPlaceholder("궁금한 내용을 입력해 주세요")
    .fill("복지정책 문서의 핵심 내용을 알려줘.");
  await page.getByRole("button", { name: "질문 전송" }).click();

  await expect(page.getByText("복지정책 문서의 핵심 내용을 알려줘.")).toBeVisible();
  await expect(page.getByText("지원 대상과 신청 기준을 확인할 수 있습니다.")).toBeVisible();
  const citation = page.getByRole("link", { name: "원문 보기" });
  await expect(citation).toBeVisible();
  await expectBox(page.locator(".civic-rag-question"), {
    x: [80, 83],
    width: [294, 297],
  });
  await expectBox(page.locator(".civic-rag-answer:not(.is-live)"), {
    x: [16, 18],
    width: [359, 362],
  });
  await expectBox(page.locator(".civic-rag-citation-card"), {
    x: [16, 18],
    width: [359, 362],
    height: [64, 68],
  });

  await page.reload();
  await expect(page.getByText("복지정책 문서의 핵심 내용을 알려줘.")).toBeVisible();
  await expect(page.getByText("지원 대상과 신청 기준을 확인할 수 있습니다.")).toBeVisible();
  await expect(page.getByRole("link", { name: "원문 보기" })).toBeVisible();

  await page.getByRole("button", { name: "새 질문" }).click();
  await expect(page.getByText("복지정책 문서의 핵심 내용을 알려줘.")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("복지정책 문서의 핵심 내용을 알려줘.")).toHaveCount(0);

  await page
    .getByPlaceholder("궁금한 내용을 입력해 주세요")
    .fill("복지정책 문서의 핵심 내용을 알려줘.");
  await page.getByRole("button", { name: "질문 전송" }).click();
  await expect(page.getByText("지원 대상과 신청 기준을 확인할 수 있습니다.")).toBeVisible();
  const restoredCitation = page.getByRole("link", { name: "원문 보기" });
  await expect(restoredCitation).toBeVisible();
  await restoredCitation.click();

  await expect(page).toHaveURL(/\/rag$/);
  await expect(page.getByRole("dialog", { name: "참조 문서" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "2026 복지정책 기본계획" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "2026 복지정책 기본계획 읽기 전용 문서" }),
  ).toBeVisible();
  const documentViewer = page.locator('[data-document-zoom="100%"]');
  await expect(documentViewer).toBeVisible();
  await page.getByRole("button", { name: "문서 확대" }).click();
  await expect(page.locator('[data-document-zoom="125%"]')).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".civic-pdf-canvas")
        .evaluate((canvas) => canvas.scrollWidth > canvas.clientWidth),
    )
    .toBe(true);
  await page.getByRole("button", { name: "화면 맞춤" }).click();
  await expect(page.locator('[data-document-zoom="100%"]')).toBeVisible();
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

test("U-RAG-001 새 대화 확인창은 데스크톱에서 platform shell 안에 표시한다", async ({
  context,
  page,
}) => {
  await page.setViewportSize({ height: 853, width: 1200 });
  await authenticate(context, "participant.payload.signature");
  await page.goto("/rag");

  const shell = page.locator('[data-platform-shell="true"]');
  await expect(page.getByPlaceholder("궁금한 내용을 입력해 주세요")).toBeEnabled();
  await page.getByRole("button", { name: "새 대화" }).click();

  const dialog = page.getByRole("alertdialog", { name: "새 대화를 시작할까요?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-dialog-scope", "platform");

  const shellBox = await shell.boundingBox();
  const dialogBox = await dialog.boundingBox();
  if (!shellBox || !dialogBox) throw new Error("platform dialog geometry missing");

  expect(dialogBox.x).toBeGreaterThanOrEqual(shellBox.x);
  expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(shellBox.x + shellBox.width);

  const backdrop = await dialog.evaluate((element) => {
    const style = getComputedStyle(element, "::backdrop");
    return { backgroundRepeat: style.backgroundRepeat, backgroundSize: style.backgroundSize };
  });
  expect(backdrop.backgroundRepeat).toBe("no-repeat");
  expect(backdrop.backgroundSize).toMatch(/393px.*100%/u);

  await dialog.getByRole("button", { name: "취소" }).click();
  await expect(dialog).toHaveCount(0);
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
    .getByPlaceholder("궁금한 내용을 입력해 주세요")
    .fill("복지정책 문서의 핵심 내용을 알려줘.");
  await page.getByRole("button", { name: "질문 전송" }).click();
  await expect(page.getByRole("status", { name: "RAG 답변 생성 중" })).toBeVisible();
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

function json(response: import("node:http").ServerResponse, body: unknown, status = 200) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJsonBody(
  request: import("node:http").IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("JSON object expected");
  }
  return body as Record<string, unknown>;
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
  survey_answers: {
    gender: "남성",
    address: "서울특별시 종로구 사직동",
    birth_year: 1990,
    marital_status: "미혼",
    housing_type: "월세",
    household_income: "연간 3천만원 이상~5천만원 미만",
    education: "대학 졸업",
    occupation: "사무직",
    lifestyle: "조심스러운 편도, 모험을 즐기는 편도 아니다",
    preferred_media: "인터넷, 소셜미디어",
    moral_orientation: "기본적인 배려와 공정성을 중시하는 일반형",
    political_ideology: "중도",
    supporting_party: "지지정당 없음",
    central_government_trust: "약간 신뢰한다",
    local_government_trust: "약간 신뢰한다",
  },
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

const processingDocumentFixture = {
  ...documentFixture,
  filename: "2026_복지정책_처리중.pdf",
  updated_at: "2026-08-29T11:02:00Z",
  active_version: {
    ...documentFixture.active_version,
    filename: "2026_복지정책_처리중.pdf",
    status: "PROCESSING",
    job_id: "job-processing-document-1",
    processing: { status: "RUNNING", progress: 72, failure_code: null },
  },
};

const currentSimulationTaskFixture = {
  taskId: "13000000-0000-4000-8000-000000000001",
  title: "지역 교통정책 조사",
  status: "OPEN",
  schedule: null,
  publishedAt: "2026-08-29T10:00:00Z",
  openedAt: "2026-08-29T10:00:00Z",
  closedAt: null,
  closureType: null,
  createdAt: "2026-08-29T10:00:00Z",
  updatedAt: "2026-08-29T10:00:00Z",
  latestSimulation: {
    simulationId: "23000000-0000-4000-8000-000000000001",
    taskId: "13000000-0000-4000-8000-000000000001",
    state: "RUNNING",
    personaCount: 800,
    progressPercent: 68,
    cancelRequested: false,
    errorCode: null,
    resumeAt: null,
    retryAvailableAt: null,
    waitReason: null,
    createdAt: "2026-08-29T10:00:00Z",
    startedAt: "2026-08-29T10:00:01Z",
    completedAt: null,
    deadlineAt: "2026-08-29T11:00:00Z",
    estimatedCompletionAt: "2026-08-29T10:20:00Z",
    canCancel: true,
    estimatedKrw: 10_000,
    holdKrw: 12_000,
    settledKrw: null,
    absorbedKrw: 0,
    billingState: "HELD",
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
