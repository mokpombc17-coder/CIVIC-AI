import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { LEGAL_DOCUMENTS } from "../../apps/web/lib/legal/legal-documents";

const root = path.resolve(process.cwd(), "../..");
const fixture = path.join(
  root,
  "services/civic-rag-service/tests/fixtures/documents/synthetic.pdf",
);
const mailpitOrigin = process.env.CIVIC_E2E_MAILPIT_ORIGIN ?? "http://localhost:18025";
const runId = process.env.CIVIC_E2E_RUN_ID ?? String(Date.now());
const adminEmail = process.env.CIVIC_E2E_ADMIN_EMAIL ?? "admin@milestone.example.test";
const bootstrapPassword = required("CIVIC_E2E_BOOTSTRAP_PASSWORD");
const rotatedAdminPassword = required("CIVIC_E2E_ROTATED_ADMIN_PASSWORD");
const participantPassword = required("CIVIC_E2E_PARTICIPANT_PASSWORD");
const participantEmail = `participant-${runId}@example.test`;
const ragAdminEmail = required("CIVIC_E2E_RAG_ADMIN_EMAIL");
const ragAdminPassword = required("CIVIC_E2E_RAG_ADMIN_PASSWORD");
const canaries = {
  cookie: required("CIVIC_E2E_CANARY_COOKIE"),
  authorization: required("CIVIC_E2E_CANARY_AUTHORIZATION"),
  csrf: required("CIVIC_E2E_CANARY_CSRF"),
  code: required("CIVIC_E2E_CANARY_CODE"),
  questionnaire: required("CIVIC_E2E_CANARY_QUESTIONNAIRE"),
  rag: required("CIVIC_E2E_CANARY_RAG"),
  document: required("CIVIC_E2E_CANARY_DOCUMENT"),
};

test("Wire Flow critical actor chain runs against real Main/Auth and RAG services", async ({
  browser,
}) => {
  await expectServicesReady();

  const admin = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const participant = await browser.newPage({ viewport: { width: 394, height: 852 } });
  const ragAdmin = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await Promise.all(
      [admin, participant, ragAdmin].map((page) =>
        page.context().addCookies([
          {
            name: "civic-telemetry-canary",
            value: canaries.cookie,
            url: required("CIVIC_E2E_ORIGIN"),
          },
        ]),
      ),
    );
    // bootstrap admin password rotation
    await login(admin, adminEmail, bootstrapPassword);
    await expect(admin).toHaveURL(/\/account\/security$/u);
    await admin.goto("/account/security");
    await admin.getByLabel("변경 작업").selectOption("password");
    await admin.getByLabel("현재 비밀번호").fill(bootstrapPassword);
    await admin.getByLabel("새 비밀번호", { exact: true }).fill(rotatedAdminPassword);
    await admin.getByLabel("새 비밀번호 확인", { exact: true }).fill(rotatedAdminPassword);
    await admin.locator("form").getByRole("button", { name: "비밀번호 변경" }).click();
    await expect(admin).toHaveURL(/\/login$/u);
    await expectCookieAbsent(admin, "civic_ai_access_token");
    await expectCookieAbsent(admin, "civic_ai_refresh_token");
    await login(admin, adminEmail, rotatedAdminPassword);
    await expect(admin).toHaveURL(/\/admin$/u);

    // participant signup and Mailpit verification
    await participant.goto("/signup/account");
    await participant.getByLabel("이메일").fill(participantEmail);
    await participant.getByLabel("비밀번호", { exact: true }).fill(participantPassword);
    await participant.getByLabel("비밀번호 확인").fill(participantPassword);
    await participant.getByLabel("만 14세 이상입니다").check();
    const signupFlowResponsePromise = participant.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/v1/signup/flows",
    );
    await participant.getByRole("button", { name: "개인정보·설문 입력" }).click();
    const signupFlowBody = (await signupFlowResponsePromise).json() as Promise<{ flow_id: string }>;
    const signupFlowId = (await signupFlowBody).flow_id;
    await participant.getByLabel("선호 언어").selectOption("ko");
    await participant.getByLabel("RAG 답변 상세도").selectOption("detailed");
    await participant.getByRole("button", { name: "필수 동의 단계로" }).click();
    await verifyLegalDocument(
      participant,
      "서비스 이용약관 전문 보기",
      LEGAL_DOCUMENTS.TERMS.id,
      LEGAL_DOCUMENTS.TERMS.title,
      LEGAL_DOCUMENTS.TERMS.bodySha256,
    );
    await verifyLegalDocument(
      participant,
      "계정·RAG 개인정보 수집·이용 전문 보기",
      LEGAL_DOCUMENTS.ACCOUNT_RAG_PRIVACY.id,
      LEGAL_DOCUMENTS.ACCOUNT_RAG_PRIVACY.title,
      LEGAL_DOCUMENTS.ACCOUNT_RAG_PRIVACY.bodySha256,
    );
    expect(
      await participant.evaluate(
        async ({ flowId, marker }) =>
          (
            await fetch(`/api/v1/signup/flows/${encodeURIComponent(flowId)}/complete`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ preferred_language: marker }),
            })
          ).status,
        { flowId: signupFlowId, marker: canaries.questionnaire },
      ),
    ).toBe(400);
    await participant.getByLabel("이용약관에 동의합니다").check();
    await participant.getByLabel("계정·RAG 개인정보 처리에 동의합니다").check();
    await participant.getByRole("button", { name: "필수 동의 후 가입" }).click();
    const code = await verificationCodeFromMailpit(participantEmail);
    await participant.getByRole("button", { name: "가입 이메일 인증" }).click();
    expect(
      await participant.evaluate(
        async (marker) =>
          (
            await fetch("/api/v1/signup/verification/verify", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ code: marker }),
            })
          ).status,
        canaries.code,
      ),
    ).toBe(400);
    await participant.getByRole("textbox", { name: "인증 코드" }).fill(code);
    await participant.getByRole("button", { name: "인증 완료" }).click();
    await expect(participant).toHaveURL(/\/login$/u);
    await expectCookieAbsent(participant, "__Host-civic-auth-flow");
    await login(participant, participantEmail, participantPassword);
    await expect(participant).toHaveURL(/\/home$/u);
    const participantId = await currentUserId(participant);
    const rejectedCanaryStatuses = await participant.evaluate(
      async ({ authorization, csrf }) => {
        const [authorizationResponse, csrfResponse] = await Promise.all([
          fetch("/api/v1/auth/login", {
            method: "POST",
            headers: {
              authorization: `Bearer ${authorization}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ email: "nobody@example.test", password: "Invalid123!" }),
          }),
          fetch("/api/v1/account/deactivate", {
            method: "POST",
            headers: { "content-type": "application/json", "x-csrf-token": csrf },
            body: JSON.stringify({ password: "Invalid123!", impact_confirmed: false }),
          }),
        ]);
        return [authorizationResponse.status, csrfResponse.status];
      },
      { authorization: canaries.authorization, csrf: canaries.csrf },
    );
    expect(rejectedCanaryStatuses).toHaveLength(2);
    for (const status of rejectedCanaryStatuses) expect(status).toBeGreaterThanOrEqual(400);

    // non-signup challenge mail is delivered synchronously through the real SMTP path
    const twoFactorRequestStatus = await participant.evaluate(
      async () =>
        (
          await fetch("/api/v1/account/2fa/enable", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ code: null }),
          })
        ).status,
    );
    expect(twoFactorRequestStatus).toBe(202);
    await expectMailpitSubject(participantEmail, "CIVIC 2단계 인증");
    const passwordResetStatus = await participant.evaluate(
      async (email) =>
        (
          await fetch("/api/v1/auth/password-reset/request", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email }),
          })
        ).status,
      participantEmail,
    );
    expect(passwordResetStatus).toBe(202);
    await expectMailpitSubject(participantEmail, "CIVIC 비밀번호 재설정");

    // administrator upload and index
    await waitForRagAccess(admin, 200);
    await login(ragAdmin, ragAdminEmail, ragAdminPassword);
    await expect(ragAdmin).toHaveURL(/\/admin\/rag$/u);
    await waitForRagAccess(ragAdmin, 200);
    await expect(ragAdmin.getByRole("heading", { name: "문서 관리" })).toBeVisible();
    await ragAdmin.goto("/admin/users");
    await expect(ragAdmin).toHaveURL(/\/forbidden$/u);
    await admin.goto("/admin/rag");
    await expect(admin.getByRole("heading", { name: "문서 관리" })).toBeVisible();
    expect(
      await admin.evaluate(async (marker) => {
        const form = new FormData();
        form.append("file", new Blob([marker], { type: "application/pdf" }), "telemetry.pdf");
        form.append("rights_confirmed", "true");
        return (await fetch("/api/v1/rag/documents", { method: "POST", body: form })).status;
      }, canaries.document),
    ).toBeGreaterThanOrEqual(400);
    await admin.locator("details[data-rag-inline-upload] > summary").click();
    await admin.locator('input[type="file"]').setInputFiles(fixture);
    await admin.getByLabel("문서 이용 권한을 보유하고 있습니다.").check();
    const [completedUpload] = await Promise.all([
      admin.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          /^\/api\/v1\/rag\/uploads\/[^/]+\/complete$/u.test(new URL(response.url()).pathname),
        { timeout: 30_000 },
      ),
      admin.getByRole("button", { name: "업로드 시작" }).click(),
    ]);
    expect(completedUpload.status()).toBe(202);
    await expect(admin.getByText("모든 파일을 접수했습니다")).toBeVisible();
    const statusLink = admin.getByRole("link", { name: "처리 상태 보기" }).first();
    await expect(statusLink).toBeVisible();
    const statusHref = await statusLink.getAttribute("href");
    const jobId = new URL(statusHref!, admin.url()).searchParams.get("jobId");
    expect(jobId).toMatch(/^[0-9a-f-]{36}$/u);
    await waitForJob(admin, jobId!, "SUCCEEDED");
    await statusLink.click();
    await admin.getByRole("button", { name: "상태 새로고침" }).click();
    await expect(admin.locator(".civic-job-summary")).toContainText("검색 준비완료");
    await expect(admin.locator(".civic-job-summary")).not.toContainText("SUCCEEDED");

    // participant query and citation source
    await participant.goto("/rag");
    await participant
      .getByPlaceholder("문서에 대해 질문하세요...")
      .fill(`${canaries.rag} 합성 CIVIC 정책 문서의 근거를 알려주세요.`);
    const [queryResponse] = await Promise.all([
      participant.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/v1/rag/queries",
      ),
      participant.getByRole("button", { name: "질문 전송" }).click(),
    ]);
    const queryBody = (await queryResponse.json()) as { code?: string };
    expect({ code: queryBody.code, status: queryResponse.status() }).toEqual({
      code: undefined,
      status: 202,
    });
    await expect(
      participant.getByText("합성 문서에 근거한 CIVIC 정책 내용을 확인했습니다."),
    ).toBeVisible({ timeout: 120_000 });
    const citation = participant.getByRole("link", { name: /synthetic\.pdf 1쪽/u });
    await expect(citation).toBeVisible();
    await citation.click();
    await expect(participant).toHaveURL(/\/rag$/u);
    await expect(participant.getByRole("dialog", { name: "참조 문서" })).toBeVisible();
    await expect(participant.getByText("이 화면은 읽기 전용입니다")).toBeVisible();
    const source = await participant.locator("iframe").getAttribute("src");
    expect(source).toMatch(/\/api\/v1\/rag\/sources\/[^/]+\/pages\/1/u);
    expect((await participant.request.get(source!.split("#")[0]!)).status()).toBe(200);

    await assertDeferredWireFlowRoutesStayInert(admin, participant);

    // self deactivation
    await participant.goto("/account/deactivate");
    await participant.getByLabel("현재 비밀번호 확인").fill(participantPassword);
    await participant
      .getByLabel("현재 활성 기능 이용이 중단되고 모든 기기에서 로그아웃되는 것을 확인했습니다.")
      .check();
    await participant.getByRole("button", { name: "계정 비활성화" }).click();
    await expect(participant).toHaveURL(/\/reactivate$/u);
    expect(
      await participant.evaluate(
        async () => (await fetch("/api/v1/auth/me", { cache: "no-store" })).status,
      ),
    ).toBe(401);
    await expectCookieAbsent(participant, "civic_ai_access_token");
    await expectCookieAbsent(participant, "civic_ai_refresh_token");
    await expectCookieAbsent(participant, "__Host-civic-auth-flow");
    const reactivationRequestStatus = await participant.evaluate(
      async ({ email, password }) =>
        (
          await fetch("/api/v1/auth/reactivation/request", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email, password }),
          })
        ).status,
      { email: participantEmail, password: participantPassword },
    );
    expect(reactivationRequestStatus).toBe(202);
    await expectMailpitSubject(participantEmail, "CIVIC 계정 재활성화");

    // administrator audit review
    await waitForAudit(admin, participantId, "ACCOUNT_DEACTIVATED");
    await admin.goto(`/admin/users/audit?userId=${encodeURIComponent(participantId)}`);
    const auditRow = admin.getByRole("row", { name: new RegExp(participantEmail, "u") }).first();
    await expect(auditRow).toContainText("계정 비활성화");
    await expect(auditRow).toContainText("SELF_DEACTIVATION");
    await expect(auditRow).not.toContainText("ACCOUNT_DEACTIVATED");
    await expect(auditRow).not.toContainText(participantId);
  } finally {
    await Promise.allSettled([
      admin.context().close(),
      participant.context().close(),
      ragAdmin.context().close(),
    ]);
  }
});

async function verifyLegalDocument(
  page: Page,
  linkName: string,
  documentId: string,
  title: string,
  sha256: string,
) {
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("link", { name: linkName }).click();
  const popup = await popupPromise;
  await expect(popup.getByRole("heading", { name: title })).toBeVisible();
  await expect(popup.locator(`[data-document-id="${documentId}"]`)).toHaveAttribute(
    "data-document-sha256",
    sha256,
  );
  await popup.close();
}

async function expectCookieAbsent(page: Page, name: string) {
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => cookie.name === name)).toBe(false);
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
}

async function currentUserId(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const response = await fetch("/api/v1/auth/me", { cache: "no-store" });
    if (!response.ok) throw new Error(`current user returned ${response.status}`);
    return ((await response.json()) as { user_id: string }).user_id;
  });
}

async function waitForRagAccess(page: Page, expected: number) {
  await expect
    .poll(
      () =>
        page.evaluate(
          async () => (await fetch("/api/v1/rag/folders", { cache: "no-store" })).status,
        ),
      { timeout: 60_000, message: "RAG account projection did not become active" },
    )
    .toBe(expected);
}

async function waitForJob(page: Page, jobId: string, expected: string) {
  await expect
    .poll(
      () =>
        page.evaluate(async (id) => {
          const response = await fetch(`/api/v1/rag/jobs/${encodeURIComponent(id)}`, {
            cache: "no-store",
          });
          const body = (await response.json()) as { status?: string; failure_code?: string };
          if (!response.ok || body.status === "FAILED") {
            throw new Error(`RAG job ${response.status}: ${body.failure_code ?? body.status}`);
          }
          return body.status;
        }, jobId),
      { timeout: 120_000, message: "document conversion and index did not finish" },
    )
    .toBe(expected);
}

async function waitForAudit(page: Page, subjectId: string, eventType: string) {
  await expect
    .poll(
      () =>
        page.evaluate(
          async ({ subject, type }) => {
            const response = await fetch("/api/v1/admin/audit", { cache: "no-store" });
            if (!response.ok) return false;
            const body = (await response.json()) as {
              items: Array<{ subject_id?: string; event_type?: string }>;
            };
            return body.items.some(
              (item) => item.subject_id === subject && item.event_type === type,
            );
          },
          { subject: subjectId, type: eventType },
        ),
      { timeout: 60_000, message: "administrator audit review did not receive the event" },
    )
    .toBe(true);
}

async function verificationCodeFromMailpit(recipient: string): Promise<string> {
  return expect
    .poll(
      async () => {
        const response = await fetch(`${mailpitOrigin}/api/v1/messages`);
        if (!response.ok) return "";
        const body = (await response.json()) as { messages?: Array<Record<string, unknown>> };
        for (const message of body.messages ?? []) {
          const recipients = JSON.stringify(message.To ?? message.to ?? "");
          if (!recipients.includes(recipient)) continue;
          const id = String(message.ID ?? message.id ?? "");
          if (!id) continue;
          const detail = await fetch(`${mailpitOrigin}/api/v1/message/${encodeURIComponent(id)}`);
          if (!detail.ok) continue;
          const text = JSON.stringify(await detail.json());
          const match = text.match(/\b(\d{6})\b/u);
          if (match) return match[1];
        }
        return "";
      },
      { timeout: 60_000, message: "Mailpit did not receive the verification code" },
    )
    .not.toBe("")
    .then(() => latestVerificationCode(recipient));
}

async function latestVerificationCode(recipient: string): Promise<string> {
  const response = await fetch(`${mailpitOrigin}/api/v1/messages`);
  const body = (await response.json()) as { messages?: Array<Record<string, unknown>> };
  for (const message of body.messages ?? []) {
    if (!JSON.stringify(message.To ?? message.to ?? "").includes(recipient)) continue;
    const id = String(message.ID ?? message.id ?? "");
    const detail = await fetch(`${mailpitOrigin}/api/v1/message/${encodeURIComponent(id)}`);
    const match = JSON.stringify(await detail.json()).match(/\b(\d{6})\b/u);
    if (match) return match[1];
  }
  throw new Error("Mailpit verification code disappeared");
}

async function expectMailpitSubject(recipient: string, subject: string) {
  await expect
    .poll(
      async () => {
        const response = await fetch(`${mailpitOrigin}/api/v1/messages`);
        if (!response.ok) return false;
        const body = (await response.json()) as { messages?: Array<Record<string, unknown>> };
        return (body.messages ?? []).some(
          (message) =>
            JSON.stringify(message.To ?? message.to ?? "").includes(recipient) &&
            String(message.Subject ?? message.subject ?? "") === subject,
        );
      },
      { timeout: 60_000, message: `Mailpit did not receive ${subject}` },
    )
    .toBe(true);
}

async function assertDeferredWireFlowRoutesStayInert(admin: Page, participant: Page) {
  const forbiddenFeatureRequests: string[] = [];
  const record = (request: { url(): string }) => {
    const url = new URL(request.url());
    if (/\/api\/.*(?:chat|decision|simulation|votes?|tasks?)/u.test(url.pathname)) {
      forbiddenFeatureRequests.push(url.pathname);
    }
  };
  participant.on("request", record);
  admin.on("request", record);
  await participant.goto("/chat");
  await expect(participant.getByText("준비 중")).toBeVisible();
  await participant.goto("/votes");
  await expect(participant.getByText("준비 중")).toBeVisible();
  await admin.goto("/admin/chat");
  await expect(admin.getByText("준비 중")).toBeVisible();
  await admin.goto("/admin/tasks");
  await expect(admin.getByText("준비 중")).toBeVisible();
  expect(forbiddenFeatureRequests).toEqual([]);
}

async function expectServicesReady() {
  const [edge, mailpit] = await Promise.all([
    fetch(process.env.CIVIC_E2E_ORIGIN ?? "http://localhost:3300"),
    fetch(`${mailpitOrigin}/livez`),
  ]);
  expect(edge.ok).toBe(true);
  expect(mailpit.ok).toBe(true);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the real milestone stack`);
  return value;
}
