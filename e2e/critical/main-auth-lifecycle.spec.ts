import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { expect, test, type Page } from "@playwright/test";
import { LEGAL_DOCUMENTS } from "../../apps/web/lib/legal/legal-documents";

const MOCK_API_HOST = "127.0.0.1";
const MOCK_API_PORT = Number(process.env.CIVIC_E2E_ADMIN_MOCK_PORT ?? "4791");
const ACCESS_COOKIE = "civic_ai_access_token";
const REFRESH_COOKIE = "civic_ai_refresh_token";
const FLOW_COOKIE = "__Host-civic-auth-flow";

let server: Server;
let lastReactivationRequest: Record<string, unknown> | null = null;
let lastPasswordResetRequest: Record<string, unknown> | null = null;
let lastPasswordResetCompletion: Record<string, unknown> | null = null;
let passwordResetVerified = false;
let passwordResetResendCount = 0;
let lastSignupCompletion: Record<string, unknown> | null = null;
let signupFlowRequestCount = 0;

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${MOCK_API_HOST}:${MOCK_API_PORT}`);
    const body = await readBody(request);

    if (url.pathname === "/api/v1/signup/flows") {
      signupFlowRequestCount += 1;
      if (body.email === "registered-active@example.com") {
        return json(
          response,
          {
            detail: "이미 가입된 이메일입니다.",
            code: "EMAIL_ALREADY_REGISTERED",
            account_state: "ACTIVE",
          },
          409,
        );
      }
      if (body.email === "registered-dormant@example.com") {
        return json(
          response,
          {
            detail: "이미 가입된 이메일입니다.",
            code: "EMAIL_ALREADY_REGISTERED",
            account_state: "INACTIVE",
          },
          409,
        );
      }
      return json(
        response,
        {
          flow_id: "signup-flow-1",
          expires_at: "2026-08-12T08:00:00Z",
          questionnaire_version: "1",
          document_versions: { TERMS: "2", ACCOUNT_RAG_PRIVACY: "2" },
          documents: {
            TERMS: {
              document_id: "TERMS",
              document_version: LEGAL_DOCUMENTS.TERMS.version,
              body_sha256: LEGAL_DOCUMENTS.TERMS.bodySha256,
              path: "/legal/terms/2",
            },
            ACCOUNT_RAG_PRIVACY: {
              document_id: "ACCOUNT_RAG_PRIVACY",
              document_version: LEGAL_DOCUMENTS.ACCOUNT_RAG_PRIVACY.version,
              body_sha256: LEGAL_DOCUMENTS.ACCOUNT_RAG_PRIVACY.bodySha256,
              path: "/legal/required-service-information/2",
            },
          },
          acceptance_controls: ["TERMS"],
        },
        201,
        authFlowCookie("signup-flow-1"),
      );
    }
    if (url.pathname === "/api/v1/signup/flows/signup-flow-1/complete") {
      lastSignupCompletion = body;
      return json(response, { next: "LOGIN" }, 201);
    }
    if (url.pathname === "/api/v1/signup/verification/verify") {
      response.writeHead(204).end();
      return;
    }
    if (url.pathname === "/api/v1/signup/verification/resend") {
      response.writeHead(202).end();
      return;
    }
    if (url.pathname === "/api/v1/auth/login") {
      if (body.email === "admin-2fa@example.com") {
        return json(response, { next: "TWO_FACTOR" }, 202, authFlowCookie("two-factor-flow"));
      }
      if (body.email === "registered-dormant@example.com") {
        return json(
          response,
          {
            detail: "비활성화된 계정입니다.",
            code: "ACCOUNT_DEACTIVATED",
            account_state: "INACTIVE",
          },
          403,
        );
      }
      response.writeHead(204, { "set-cookie": authCookies("participant.payload.signature") }).end();
      return;
    }
    if (url.pathname === "/api/v1/auth/2fa/verify") {
      response.writeHead(204, { "set-cookie": authCookies("admin.payload.signature") }).end();
      return;
    }
    if (url.pathname === "/api/v1/auth/2fa/resend") {
      response.writeHead(202).end();
      return;
    }
    if (url.pathname === "/api/v1/auth/me") {
      const cookie = request.headers.cookie ?? "";
      if (cookie.includes(`${ACCESS_COOKIE}=admin.payload.signature`)) {
        return json(response, currentUser("00000000-0000-4000-8000-000000000002", "ADMIN"));
      }
      if (cookie.includes(`${ACCESS_COOKIE}=participant.payload.signature`)) {
        return json(response, currentUser("00000000-0000-4000-8000-000000000001", "PARTICIPANT"));
      }
      response.writeHead(401).end();
      return;
    }
    if (url.pathname === "/api/v1/auth/password-reset/request") {
      lastPasswordResetRequest = body;
      passwordResetVerified = false;
      return json(
        response,
        { masked_email: "ci***@example.com", ...passwordResetSchedule(60) },
        202,
        authFlowCookie("reset-flow"),
      );
    }
    if (url.pathname === "/api/v1/auth/password-reset/resend") {
      passwordResetResendCount += 1;
      passwordResetVerified = false;
      return json(response, passwordResetSchedule(60), 202, authFlowCookie("reset-flow"));
    }
    if (url.pathname === "/api/v1/auth/password-reset/verify") {
      if (body.code !== "111222") {
        return json(
          response,
          {
            status: 401,
            code: "PASSWORD_RESET_CODE_MISMATCH",
            detail: "Authentication code is invalid",
          },
          401,
        );
      }
      passwordResetVerified = true;
      response.writeHead(204, { "set-cookie": authFlowCookie("reset-flow") }).end();
      return;
    }
    if (url.pathname === "/api/v1/auth/password-reset/complete") {
      lastPasswordResetCompletion = body;
      if (!passwordResetVerified) {
        return json(
          response,
          {
            status: 401,
            code: "PASSWORD_RESET_NOT_VERIFIED",
            detail: "Authentication code is invalid",
          },
          401,
        );
      }
      passwordResetVerified = false;
      if (body.new_password === "OldCivic!234") {
        return json(
          response,
          {
            status: 401,
            code: "PASSWORD_REUSED",
            detail: "New password must differ from the current password",
          },
          401,
        );
      }
      response.writeHead(204).end();
      return;
    }
    if (url.pathname === "/api/v1/auth/reactivation/request") {
      lastReactivationRequest = body;
      response.writeHead(202, { "set-cookie": authFlowCookie("reactivation-flow") }).end();
      return;
    }
    if (url.pathname === "/api/v1/auth/reactivation/complete") {
      response.writeHead(204).end();
      return;
    }

    response.writeHead(404).end();
  });
  await listen(server);
});

test.afterAll(async () => close(server));

test("회원가입은 계정 정보, 이메일 인증, 약관 동의와 필수정보 확인 순서로 완료한다", async ({
  page,
}) => {
  await page.goto("/signup/account");
  await page.getByLabel("이메일").fill("new-user@example.com");
  await page.getByLabel("비밀번호", { exact: true }).fill("Civic!234");
  await page.getByLabel("비밀번호 확인").fill("Civic!234");
  await page.getByLabel("만 14세 이상입니다").check();
  await expect(page.getByRole("navigation", { name: "회원가입 단계" })).toContainText(
    "1/3계정 정보",
  );
  await expect(page.getByLabel("선호 언어")).toHaveCount(0);
  await expect(page.getByLabel("AI 답변 상세도")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "서비스 이용약관 전문 보기" })).toHaveCount(0);
  await page.getByRole("button", { name: "인증 코드 받기" }).click();

  await expect(page.getByRole("heading", { name: "이메일 인증" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "회원가입 단계" })).toContainText(
    "2/3이메일 인증",
  );
  expect(lastSignupCompletion).toBeNull();
  await page.getByRole("textbox", { name: "인증 코드" }).fill("123456");
  await page.getByRole("button", { name: "인증하기" }).click();

  await expect(page.getByRole("navigation", { name: "회원가입 단계" })).toContainText(
    "3/3약관 동의·필수정보",
  );
  await expect(page.getByRole("link", { name: "서비스 이용약관 전문 보기" })).toHaveAttribute(
    "href",
    "/legal/terms/2",
  );
  await expect(
    page.getByRole("link", { name: "개인정보 필수정보 처리 안내 전문 보기" }),
  ).toHaveAttribute("href", "/legal/required-service-information/2");
  const termsPopupPromise = page.waitForEvent("popup");
  await page.getByRole("link", { name: "서비스 이용약관 전문 보기" }).click();
  const termsPopup = await termsPopupPromise;
  await expect(
    termsPopup.getByRole("heading", { name: LEGAL_DOCUMENTS.TERMS.title }),
  ).toBeVisible();
  await expect(termsPopup.locator("[data-document-id=TERMS]")).toHaveAttribute(
    "data-document-sha256",
    LEGAL_DOCUMENTS.TERMS.bodySha256,
  );
  await termsPopup.close();
  const privacyPopupPromise = page.waitForEvent("popup");
  await page.getByRole("link", { name: "개인정보 필수정보 처리 안내 전문 보기" }).click();
  const privacyPopup = await privacyPopupPromise;
  await expect(
    privacyPopup.getByRole("heading", { name: LEGAL_DOCUMENTS.ACCOUNT_RAG_PRIVACY.title }),
  ).toBeVisible();
  await expect(privacyPopup.locator("[data-document-id=ACCOUNT_RAG_PRIVACY]")).toHaveAttribute(
    "data-document-sha256",
    LEGAL_DOCUMENTS.ACCOUNT_RAG_PRIVACY.bodySha256,
  );
  await privacyPopup.close();
  await page.getByLabel("이용약관에 동의합니다").check();
  await expect(page.getByLabel("계정·RAG 개인정보 수집·이용에 동의합니다")).toHaveCount(0);
  await page.getByRole("button", { name: "약관에 동의하고 가입하기" }).click();
  await expect(page).toHaveURL(/\/login$/u);

  expect(lastSignupCompletion).toMatchObject({
    preferred_language: "ko",
    rag_answer_detail: "balanced",
    terms_evidence: {
      document_id: "TERMS",
      document_version: "2",
      body_sha256: LEGAL_DOCUMENTS.TERMS.bodySha256,
      path: "/legal/terms/2",
    },
  });
  expect(lastSignupCompletion).not.toHaveProperty("privacy_evidence");
});

test("비밀번호 규칙 오류는 계정 정보 단계에서 다음 단계 이동과 API 요청을 막는다", async ({
  page,
}) => {
  const requestCountBeforeSubmit = signupFlowRequestCount;

  await page.goto("/signup/account");
  await page.getByLabel("이메일").fill("invalid-password@example.com");
  await page.getByLabel("비밀번호", { exact: true }).fill("Invalid123?");
  await page.getByLabel("비밀번호 확인").fill("Invalid123?");
  await page.getByLabel("만 14세 이상입니다").check();
  await page.getByRole("button", { name: "인증 코드 받기" }).click();

  await expect(page).toHaveURL(/\/signup\/account$/u);
  await expect(page.getByRole("navigation", { name: "회원가입 단계" })).toContainText(
    "1/3계정 정보",
  );
  await expect(page.getByRole("status")).toContainText(
    "비밀번호는 8~1024자의 영문·숫자·특수문자(!@#$%^&*()_+-=) 조합으로 입력해 주세요.",
  );
  expect(signupFlowRequestCount).toBe(requestCountBeforeSubmit);
});

test("이미 가입된 이메일은 계정 상태에 따라 로그인 또는 재활성화로 안내한다", async ({ page }) => {
  await page.goto("/signup/account");
  await page.getByLabel("이메일").fill("registered-active@example.com");
  await page.getByLabel("비밀번호", { exact: true }).fill("Civic!234");
  await page.getByLabel("비밀번호 확인").fill("Civic!234");
  await page.getByLabel("만 14세 이상입니다").check();
  await page.getByRole("button", { name: "인증 코드 받기" }).click();

  await expect(page.getByText("이미 가입된 이메일")).toBeVisible();
  await expect(page.getByRole("link", { name: "로그인으로 이동" })).toHaveAttribute(
    "href",
    "/login",
  );

  await page.getByLabel("이메일").fill("registered-dormant@example.com");
  await expect(page.getByText("이미 가입된 이메일")).toHaveCount(0);

  await page.getByRole("button", { name: "인증 코드 받기" }).click();
  await expect(page.getByText("이미 가입된 이메일")).toBeVisible();
  await expect(page.getByRole("link", { name: "계정 재활성화" })).toHaveAttribute(
    "href",
    "/reactivate",
  );
  await expect(page.getByRole("link", { name: "로그인으로 이동" })).toHaveCount(0);
});

test("비활성화된 계정 로그인은 재활성화 안내와 텍스트 버튼을 보여 준다", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("이메일").fill("registered-dormant@example.com");
  await page.getByLabel("비밀번호", { exact: true }).fill("Civic!234");
  await page.getByRole("button", { name: "로그인", exact: true }).click();

  await expect(page.getByText("비활성화된 계정", { exact: true })).toBeVisible();
  const notice = page.locator(".civic-login-deactivated");
  await expect(notice.getByRole("link", { name: "계정 재활성화" })).toHaveAttribute(
    "href",
    "/reactivate",
  );
});

test("2FA 로그인은 auth-flow cookie로 코드 확인 후 관리자 홈으로 이동한다", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("이메일").fill("admin-2fa@example.com");
  await page.getByLabel("비밀번호").fill("Civic!234");
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(page).toHaveURL(/\/signup\/verify\?kind=two-factor/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "이메일 인증" })).toBeVisible();
  await page.getByRole("textbox", { name: "인증 코드" }).fill("654321");
  await page.getByRole("button", { name: "인증하기" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "관리 업무" })).toBeVisible();
  await expectAuthCookies(page);
});

test("참여자 로그인은 검증된 동일 출처 returnTo 경로로 복귀한다", async ({ page }) => {
  await page.goto("/login?returnTo=%2Frag");
  await page.getByLabel("이메일").fill("participant@example.com");
  await page.getByLabel("비밀번호").fill("Civic!234");
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(page).toHaveURL(/\/rag$/);
  await expectAuthCookies(page);
});

test("후속 가입 단계를 새로 열어 흐름 메타데이터가 없으면 계정 입력으로 복구한다", async ({
  page,
}) => {
  await page.goto("/signup/consent");

  await expect(page).toHaveURL(/\/signup\/account$/);
  await expect(page.getByRole("heading", { name: "필수 입력" })).toBeVisible();
});

async function startPasswordReset(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill("citizen@example.com");
  await page.getByRole("button", { name: "비밀번호 재설정" }).click();
  await expect(page).toHaveURL(/\/password-reset$/u);
  await expect(page.getByRole("heading", { name: "이메일 입력" })).toBeVisible();
  await expect(page.getByLabel("이메일")).toHaveValue("citizen@example.com");
  await page.getByRole("button", { name: "인증번호 받기" }).click();
  await expect(page.getByRole("heading", { name: "인증번호 입력" })).toBeVisible();
  await expect(page.getByText("ci***@example.com으로 인증번호를 전송했습니다.")).toBeVisible();
  expect(lastPasswordResetRequest).toEqual({ email: "citizen@example.com" });
}

test("로그인 화면에서 연 비밀번호 재설정은 이메일을 바꿀 수 있고 뒤로가기로 로그인에 돌아간다", async ({
  page,
}) => {
  lastPasswordResetRequest = null;
  await page.goto("/login");
  await page.getByLabel("이메일").fill("first@example.com");
  await page.getByRole("button", { name: "비밀번호 재설정" }).click();
  await expect(page.getByLabel("이메일")).toHaveValue("first@example.com");
  await page.getByLabel("이메일").fill("citizen@example.com");
  await page.getByRole("button", { name: "인증번호 받기" }).click();
  await expect(page.getByRole("heading", { name: "인증번호 입력" })).toBeVisible();
  expect(lastPasswordResetRequest).toEqual({ email: "citizen@example.com" });

  await page.goBack();
  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.getByRole("button", { name: "로그인", exact: true })).toBeVisible();
});

test("비밀번호 재설정 코드 재발송은 서버가 알려준 시각까지 잠기고 같은 흐름으로 다시 보낸다", async ({
  page,
}) => {
  passwordResetResendCount = 0;
  await startPasswordReset(page);
  const resend = page.getByRole("button", { name: /^코드 재발송/u });
  await expect(resend).toBeDisabled();
  await expect(resend).toHaveText(/코드 재발송 \(\d+초\)/u);

  await page.clock.install();
  await page.clock.fastForward(61_000);
  await expect(resend).toHaveText("코드 재발송");
  await resend.click();
  await expect(page.getByText("인증번호를 다시 보냈습니다.")).toBeVisible();
  expect(passwordResetResendCount).toBe(1);
});

test("비밀번호 재설정은 서버가 확인한 인증번호로만 새 비밀번호 단계에 들어간다", async ({
  page,
}) => {
  lastPasswordResetRequest = null;
  lastPasswordResetCompletion = null;
  await startPasswordReset(page);

  await page.getByLabel("6자리 인증번호").fill("000000");
  await page.getByRole("button", { name: "인증번호 확인" }).click();
  await expect(page.getByText("인증번호가 올바르지 않습니다. 다시 확인해 주세요.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "인증번호 입력" })).toBeVisible();
  await expect(page.getByLabel("새 비밀번호", { exact: true })).toHaveCount(0);

  await page.getByLabel("6자리 인증번호").fill("111222");
  await page.getByRole("button", { name: "인증번호 확인" }).click();
  await expect(page.getByRole("heading", { name: "새 비밀번호 설정" })).toBeVisible();
  await page.getByLabel("새 비밀번호", { exact: true }).fill("NewCivic!234");
  await page.getByLabel("새 비밀번호 확인").fill("NewCivic!234");
  await page.getByRole("button", { name: "비밀번호 변경" }).click();
  await expect(page).toHaveURL(/\/login$/u);
  expect(lastPasswordResetCompletion).toEqual({ new_password: "NewCivic!234" });
});

test("비밀번호 재설정에서 기존 비밀번호를 쓰면 이메일 단계로 돌아간다", async ({ page }) => {
  lastPasswordResetRequest = null;
  lastPasswordResetCompletion = null;
  await startPasswordReset(page);

  await page.getByLabel("6자리 인증번호").fill("111222");
  await page.getByRole("button", { name: "인증번호 확인" }).click();
  await expect(page.getByRole("heading", { name: "새 비밀번호 설정" })).toBeVisible();
  await page.getByLabel("새 비밀번호", { exact: true }).fill("OldCivic!234");
  await page.getByLabel("새 비밀번호 확인").fill("OldCivic!234");
  await page.getByRole("button", { name: "비밀번호 변경" }).click();

  await expect(
    page.getByText(
      "기존 비밀번호와 다른 비밀번호를 사용해 주세요. 인증번호를 다시 받아 진행해 주세요.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "이메일 입력" })).toBeVisible();
  await expect(page.getByLabel("이메일")).toHaveValue("citizen@example.com");
  await expect(page).toHaveURL(/\/password-reset$/u);
});

test("재활성화는 비밀번호와 등록 이메일 코드를 모두 확인한다", async ({ page }) => {
  lastReactivationRequest = null;
  await page.goto("/reactivate");
  await page.getByLabel("이메일").fill("inactive@example.com");
  await page.getByLabel("비밀번호 확인").fill("Civic!234");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/v1/auth/reactivation/request",
    ),
    page.getByRole("button", { name: "인증 코드 받기" }).click(),
  ]);

  await expect(page.getByRole("heading", { name: "계정 재활성화" })).toBeVisible();
  expect(lastReactivationRequest).toEqual({
    email: "inactive@example.com",
    password: "Civic!234",
  });
  await page.getByRole("textbox", { name: "인증 코드" }).fill("999888");
  await page.getByRole("button", { name: "계정 재활성화" }).click();
  await expect(page).toHaveURL(/\/login$/u);
});

function passwordResetSchedule(resendAfterSeconds: number): Record<string, string> {
  const now = Date.now();
  return {
    expires_at: new Date(now + 10 * 60_000).toISOString(),
    resend_available_at: new Date(now + resendAfterSeconds * 1000).toISOString(),
  };
}

function authFlowCookie(value: string): string {
  return `${FLOW_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

function accessCookie(value: string): string {
  return `${ACCESS_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

function refreshCookie(): string {
  return `${REFRESH_COOKIE}=opaque-refresh; Path=/api/v1/auth; Secure; HttpOnly; SameSite=Lax`;
}

function authCookies(accessToken: string): string[] {
  return [accessCookie(accessToken), refreshCookie()];
}

async function expectAuthCookies(page: import("@playwright/test").Page): Promise<void> {
  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === ACCESS_COOKIE)).toMatchObject({
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
  });
  expect(cookies.find((cookie) => cookie.name === REFRESH_COOKIE)).toMatchObject({
    httpOnly: true,
    sameSite: "Lax",
    path: "/api/v1/auth",
  });
}

function currentUser(userId: string, role: "PARTICIPANT" | "ADMIN") {
  return {
    user_id: userId,
    role,
    permissions: [],
    account_state: "ACTIVE",
    must_change_password: false,
  };
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function json(response: ServerResponse, body: unknown, status = 200, cookie?: string): void {
  response.writeHead(status, {
    "content-type": "application/json",
    ...(cookie ? { "set-cookie": cookie } : {}),
  });
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
