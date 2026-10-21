import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import type {
  PendingSurveyResponse,
  SubmitSurveyRequest,
  SurveyQuestion,
  SurveySection,
} from "../apps/web/lib/survey/survey-contracts";

const ROUND_ID = uuid(1);
const CONTENT_VERSION_ID = uuid(2);
// 실제 1회차처럼 정치 성향 영역의 단일 선택 문항 일부를 선택 문항으로 둠
const OPTIONAL_GENERAL_QUESTION_INDEXES = new Set([12, 18]);
const SURVEY_RESPONSE = createSurveyResponse();
const CONSENT_RECEIPT_ID = uuid(4);
const CONSENT_ACCEPTANCES_PATH = "/api/v1/me/consent-acceptances";
const OPTIONAL_QUESTION_TITLES = new Set(
  [...OPTIONAL_GENERAL_QUESTION_INDEXES].map((index) => `문항 ${index}`),
);

test("필수 답변 42개를 검증하고 29개 Question을 한 번만 제출한다", async ({ page }) => {
  let submittedCommand: SubmitSurveyRequest | null = null;
  let idempotencyKey: string | null = null;

  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({ json: { subject: "survey-e2e-user" } });
  });
  await page.route("https://t1.kakaocdn.net/**", async (route) => {
    await route.abort("failed");
  });
  await page.route("**/api/v1/me/**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const corsHeaders = {
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "accept, content-type, idempotency-key",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-origin": new URL(page.url() || "http://localhost:3000").origin,
    };

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (requestUrl.pathname === "/api/v1/me/surveys/current" && request.method() === "GET") {
      await route.fulfill({ json: SURVEY_RESPONSE, headers: corsHeaders });
      return;
    }
    if (await fulfillConsentAcceptance(route, requestUrl, corsHeaders)) {
      return;
    }
    if (requestUrl.pathname === "/api/v1/me/survey-responses" && request.method() === "POST") {
      submittedCommand = request.postDataJSON() as SubmitSurveyRequest;
      idempotencyKey = request.headers()["idempotency-key"] ?? null;
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: {
          status: "PREVIEW_VALIDATED",
          persisted: false,
          roundId: ROUND_ID,
          contentVersionId: CONTENT_VERSION_ID,
          validatedAt: "2026-09-02T00:00:00Z",
        },
      });
      return;
    }

    await route.abort("failed");
  });

  await page.goto("/survey");
  await expect(page.getByRole("button", { name: "뒤로 가기" })).toBeDisabled();
  const form = page.locator("[data-survey-step]");
  await expect(form).toHaveAttribute("data-survey-step", "1");

  await page.getByRole("button", { name: "다음으로", exact: true }).click();
  await expect(form).toHaveAttribute("data-survey-step", "1");
  await expect(form.locator('[data-invalid="true"]')).toHaveCount(4);

  for (let step = 1; step <= 7; step += 1) {
    await expect(form).toHaveAttribute("data-survey-step", String(step));
    await answerCurrentSection(page);
    await page.getByRole("button", { name: "다음으로", exact: true }).click();
    if (step === 1) {
      await expect(form).toHaveAttribute("data-survey-step", "2");
      await page.getByRole("button", { name: "이전 설문 단계로" }).click();
      await expect(form).toHaveAttribute("data-survey-step", "1");
      await expect(page.getByRole("button", { name: "뒤로 가기" })).toBeDisabled();
      await page.getByRole("button", { name: "다음으로", exact: true }).click();
    }
  }

  await expect(form).toHaveAttribute("data-survey-step", "8");
  const submitButton = page.getByRole("button", { name: "제출하기", exact: true });
  await expect(submitButton).toBeDisabled();
  await page.getByText("민감정보 수집·이용에 동의합니다", { exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: /민감정보 수집·이용에 동의합니다/ }),
  ).toBeChecked();
  await expect(submitButton).toBeEnabled();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(sessionStorage).filter((key) => key.startsWith("civic-ai:survey-draft:v1"))
            .length,
      ),
    )
    .toBe(1);

  await submitButton.click();
  await expect(page).toHaveURL(/\/survey$/);
  await expect(page.getByRole("heading", { name: "설문 응답 검증을 완료했습니다." })).toBeVisible();

  expect(submittedCommand).not.toBeNull();
  expect(submittedCommand!.roundId).toBe(ROUND_ID);
  expect(submittedCommand!.consentReceiptId).toBe(CONSENT_RECEIPT_ID);
  expect(submittedCommand!.answers).toHaveLength(29);
  expect(countAnswerValues(submittedCommand!)).toBe(42);
  expect(new Set(submittedCommand!.answers.map((answer) => answer.questionId)).size).toBe(29);
  expect(idempotencyKey).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((key) => key.startsWith("civic-ai:survey-draft:v1")),
    ),
  ).toEqual([]);
});

test("제출 401이면 토큰 갱신 후 같은 payload와 멱등성 키로 한 번만 재시도한다", async ({
  page,
}) => {
  const attempts: Array<Readonly<{ command: SubmitSurveyRequest; idempotencyKey: string | null }>> =
    [];
  let refreshCount = 0;

  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({ json: { subject: "survey-refresh-e2e-user" } });
  });
  await page.route("https://t1.kakaocdn.net/**", async (route) => {
    await route.abort("failed");
  });
  await page.route("**/api/v1/auth/refresh", async (route) => {
    const corsHeaders = createCorsHeaders(page);
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    refreshCount += 1;
    await route.fulfill({ status: 204, headers: corsHeaders });
  });
  await page.route("**/api/v1/me/**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const corsHeaders = createCorsHeaders(page);

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (requestUrl.pathname === "/api/v1/me/surveys/current" && request.method() === "GET") {
      await route.fulfill({ json: SURVEY_RESPONSE, headers: corsHeaders });
      return;
    }
    if (await fulfillConsentAcceptance(route, requestUrl, corsHeaders)) {
      return;
    }
    if (requestUrl.pathname === "/api/v1/me/survey-responses" && request.method() === "POST") {
      attempts.push({
        command: request.postDataJSON() as SubmitSurveyRequest,
        idempotencyKey: request.headers()["idempotency-key"] ?? null,
      });
      if (attempts.length === 1) {
        await route.fulfill({
          status: 401,
          headers: corsHeaders,
          json: {
            type: "urn:civic-ai:problem:unauthenticated",
            title: "Authentication required",
            status: 401,
            detail: "The access token has expired.",
            instance: requestUrl.pathname,
            code: "UNAUTHENTICATED",
            retryable: false,
          },
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: {
          status: "PREVIEW_VALIDATED",
          persisted: false,
          roundId: ROUND_ID,
          contentVersionId: CONTENT_VERSION_ID,
          validatedAt: "2026-09-02T00:00:00Z",
        },
      });
      return;
    }

    await route.abort("failed");
  });

  await advanceAnsweredSurveyToConfirmation(page);
  await page.getByText("민감정보 수집·이용에 동의합니다", { exact: true }).click();
  await page.getByRole("button", { name: "제출하기", exact: true }).click();
  await expect(page).toHaveURL(/\/survey$/);
  await expect(page.getByRole("heading", { name: "설문 응답 검증을 완료했습니다." })).toBeVisible();

  expect(refreshCount).toBe(1);
  expect(attempts).toHaveLength(2);
  expect(attempts[1]!.idempotencyKey).toBe(attempts[0]!.idempotencyKey);
  expect(attempts[1]!.command).toEqual(attempts[0]!.command);
});

test("미완료 사용자를 설문으로 보내고 영구 제출 후 원래 경로로 복귀시킨다", async ({ page }) => {
  const eligibilityResults: boolean[] = [];
  let submitted = false;

  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({ json: { subject: "survey-eligibility-e2e-user" } });
  });
  await page.route("https://t1.kakaocdn.net/**", async (route) => {
    await route.abort("failed");
  });
  await page.route("**/api/v1/me/**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const corsHeaders = createCorsHeaders(page);

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (requestUrl.pathname === "/api/v1/me/service-eligibility" && request.method() === "GET") {
      eligibilityResults.push(submitted);
      await route.fulfill({
        headers: corsHeaders,
        json: {
          activeRoundId: submitted ? null : ROUND_ID,
          capabilities: submitted
            ? ["USE_GENERAL_SERVICE", "USE_PERSONALIZED_SERVICE"]
            : ["VIEW_CURRENT_SURVEY", "SUBMIT_CURRENT_SURVEY"],
          eligible: submitted,
          evaluatedAt: "2026-09-03T00:00:00Z",
          nextAction: submitted ? null : "COMPLETE_CURRENT_SURVEY",
          reason: submitted ? null : "CURRENT_SURVEY_RESPONSE_REQUIRED",
          surveyRequirement: submitted ? "SATISFIED" : "REQUIRED",
        },
      });
      return;
    }
    if (requestUrl.pathname === "/api/v1/me/surveys/current" && request.method() === "GET") {
      await route.fulfill({ json: SURVEY_RESPONSE, headers: corsHeaders });
      return;
    }
    if (await fulfillConsentAcceptance(route, requestUrl, corsHeaders)) {
      return;
    }
    if (requestUrl.pathname === "/api/v1/me/survey-responses" && request.method() === "POST") {
      submitted = true;
      await route.fulfill({
        status: 201,
        headers: corsHeaders,
        json: {
          status: "SUBMITTED",
          persisted: true,
          replayed: false,
          responseId: uuid(3),
          roundId: ROUND_ID,
          contentVersionId: CONTENT_VERSION_ID,
          submittedAt: "2026-09-03T00:00:00Z",
        },
      });
      return;
    }

    await route.abort("failed");
  });

  const returnTo = "/vote/task-1?source=push#answer";
  await page.goto(returnTo);
  await expect
    .poll(() => {
      const currentUrl = new URL(page.url());
      return {
        pathname: currentUrl.pathname,
        returnTo: currentUrl.searchParams.get("returnTo"),
      };
    })
    .toEqual({ pathname: "/survey", returnTo });

  await answerVisibleSurveyToConfirmation(page);
  await page.getByText("민감정보 수집·이용에 동의합니다", { exact: true }).click();
  await page.getByRole("button", { name: "제출하기", exact: true }).click();

  await expect(page).toHaveURL(/\/vote\/task-1\?source=push#answer$/);
  expect(eligibilityResults[0]).toBe(false);
  expect(eligibilityResults.at(-1)).toBe(true);
  expect(eligibilityResults.filter(Boolean).length).toBeGreaterThanOrEqual(1);
});

test("선택 문항을 비우면 동의 없이 receipt와 선택 문항 answer를 빼고 제출한다", async ({
  page,
}) => {
  let submittedCommand: SubmitSurveyRequest | null = null;
  let consentRequestCount = 0;

  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({ json: { subject: "survey-optional-e2e-user" } });
  });
  await page.route("https://t1.kakaocdn.net/**", async (route) => {
    await route.abort("failed");
  });
  await page.route("**/api/v1/me/**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const corsHeaders = createCorsHeaders(page);

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (requestUrl.pathname === "/api/v1/me/surveys/current" && request.method() === "GET") {
      await route.fulfill({ json: SURVEY_RESPONSE, headers: corsHeaders });
      return;
    }
    if (requestUrl.pathname === CONSENT_ACCEPTANCES_PATH) {
      consentRequestCount += 1;
    }
    if (await fulfillConsentAcceptance(route, requestUrl, corsHeaders)) {
      return;
    }
    if (requestUrl.pathname === "/api/v1/me/survey-responses" && request.method() === "POST") {
      submittedCommand = request.postDataJSON() as SubmitSurveyRequest;
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: {
          status: "PREVIEW_VALIDATED",
          persisted: false,
          roundId: ROUND_ID,
          contentVersionId: CONTENT_VERSION_ID,
          validatedAt: "2026-09-02T00:00:00Z",
        },
      });
      return;
    }

    await route.abort("failed");
  });

  await page.goto("/survey");
  await expect(
    page.getByRole("heading", { name: "문항 1", exact: true }),
    "필수 문항에는 선택 문항 표시를 붙이지 않아야 합니다.",
  ).toBeVisible();
  await answerVisibleSurveyToConfirmation(page, OPTIONAL_QUESTION_TITLES, async (title) => {
    await expect(
      page.getByRole("heading", { name: `${title} 선택 문항`, exact: true }),
    ).toBeVisible();
  });

  await expect(page.getByRole("checkbox", { name: /민감정보 수집·이용에 동의합니다/ })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("민감정보 문항에 응답하지 않아 별도 동의가 필요하지 않습니다.", {
      exact: true,
    }),
  ).toBeVisible();
  const submitButton = page.getByRole("button", { name: "제출하기", exact: true });
  await expect(submitButton).toBeEnabled();

  await submitButton.click();
  await expect(page.getByRole("heading", { name: "설문 응답 검증을 완료했습니다." })).toBeVisible();

  expect(consentRequestCount).toBe(0);
  expect(submittedCommand).not.toBeNull();
  expect(submittedCommand).not.toHaveProperty("consentReceiptId");
  expect(submittedCommand!.answers).toHaveLength(29 - OPTIONAL_GENERAL_QUESTION_INDEXES.size);
  const submittedQuestionIds = new Set(
    submittedCommand!.answers.map((answer) => answer.questionId),
  );
  for (const index of OPTIONAL_GENERAL_QUESTION_INDEXES) {
    expect(submittedQuestionIds.has(uuid(100 + index))).toBe(false);
  }
});

async function fulfillConsentAcceptance(
  route: Route,
  requestUrl: URL,
  corsHeaders: Record<string, string>,
): Promise<boolean> {
  if (requestUrl.pathname !== CONSENT_ACCEPTANCES_PATH || route.request().method() !== "POST") {
    return false;
  }

  await route.fulfill({
    status: 201,
    headers: corsHeaders,
    json: { consentReceiptId: CONSENT_RECEIPT_ID, acceptedAt: "2026-09-02T00:00:00Z" },
  });
  return true;
}

async function advanceAnsweredSurveyToConfirmation(page: Page): Promise<void> {
  await page.goto("/survey");
  await answerVisibleSurveyToConfirmation(page);
}

async function answerVisibleSurveyToConfirmation(
  page: Page,
  skippedQuestionTitles: ReadonlySet<string> = new Set(),
  onSkippedQuestionVisible?: (title: string) => Promise<void>,
): Promise<void> {
  const form = page.locator("[data-survey-step]");
  for (let step = 1; step <= 7; step += 1) {
    await expect(form).toHaveAttribute("data-survey-step", String(step));
    for (const title of skippedQuestionTitles) {
      const heading = form.getByRole("heading", { name: new RegExp(`^${title}( |$)`) });
      if ((await heading.count()) > 0) await onSkippedQuestionVisible?.(title);
    }
    await answerCurrentSection(page, skippedQuestionTitles);
    await page.getByRole("button", { name: "다음으로", exact: true }).click();
  }
  await expect(form).toHaveAttribute("data-survey-step", "8");
}

function createCorsHeaders(page: Page): Record<string, string> {
  return {
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "accept, content-type, idempotency-key",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-origin": new URL(page.url() || "http://localhost:3000").origin,
  };
}

async function answerCurrentSection(
  page: Page,
  skippedQuestionTitles: ReadonlySet<string> = new Set(),
): Promise<void> {
  const form = page.locator("[data-survey-step]");
  const isSkipped = async (control: Locator) =>
    skippedQuestionTitles.has(
      await control.evaluate(
        (element) =>
          element.closest("section")?.querySelector("h3")?.firstChild?.textContent?.trim() ?? "",
      ),
    );

  for (const input of await form.locator('input[type="text"]').all()) {
    await input.fill("테스트 답변");
  }
  const residenceLookup = form.getByRole("button", { name: "주소지 시/도 검색" });
  if ((await residenceLookup.count()) > 0) {
    await residenceLookup.click();
    await page.getByRole("button", { name: "직접 입력하기" }).click();
    const values = ["경기도", "성남시 분당구", "백현동"];
    const inputs = await form.locator('input[data-residence-manual="true"]').all();
    for (const [index, input] of inputs.entries()) {
      await input.fill(values[index]!);
    }
  }
  for (const input of await form.locator('input[type="number"]').all()) {
    await input.fill("10");
  }
  for (const textarea of await form.locator("textarea").all()) {
    await textarea.fill("테스트 장문 답변");
  }
  for (const combobox of await form.getByRole("combobox").all()) {
    if (await isSkipped(combobox)) continue;
    await combobox.click();
    await page.getByRole("option").first().click();
  }
  for (const trigger of await form.locator('button[aria-label$="복수 선택"]').all()) {
    await trigger.click();
    const menuId = await trigger.getAttribute("aria-controls");
    expect(menuId).not.toBeNull();
    const firstOption = form.locator(`[id="${menuId}"] fieldset label`).first();
    await firstOption.click();
    await expect(firstOption.locator('input[type="checkbox"]')).toBeChecked();
    await trigger.click();
  }

  await form.locator('input[type="radio"]').evaluateAll(
    (inputs, skippedTitles) => {
      const answeredGroups = new Set<string>();
      for (const input of inputs) {
        if (!(input instanceof HTMLInputElement) || answeredGroups.has(input.name)) continue;
        const title =
          input.closest("section")?.querySelector("h3")?.firstChild?.textContent?.trim() ?? "";
        if (skippedTitles.includes(title)) continue;
        input.click();
        answeredGroups.add(input.name);
      }
    },
    [...skippedQuestionTitles],
  );
}

function countAnswerValues(command: SubmitSurveyRequest): number {
  return command.answers.reduce(
    (count, answer) =>
      count +
      (answer.type === "MATRIX_SINGLE_CHOICE" || answer.type === "MATRIX_SCALE"
        ? answer.itemAnswers.length
        : 1),
    0,
  );
}

function createSurveyResponse(): PendingSurveyResponse {
  let generalQuestionIndex = 0;
  const nextGeneralQuestions = (count: number) =>
    Array.from({ length: count }, () => createGeneralQuestion(++generalQuestionIndex));

  const sections: SurveySection[] = [
    createSection("personal-information", "일반 개인정보", nextGeneralQuestions(4)),
    createSection("household-information", "가구 정보", [
      ...nextGeneralQuestions(1),
      createMatrixChoiceQuestion("household.age-group-presence", 6),
      ...nextGeneralQuestions(2),
    ]),
    createSection("life-economy", "생활 · 경제", nextGeneralQuestions(4)),
    createSection("values-politics", "가치 · 정치 성향", nextGeneralQuestions(4)),
    createSection("media-opinion", "미디어 · 의견 성향", nextGeneralQuestions(4)),
    createSection("social-institutional-trust", "사회 · 기관 신뢰", [
      createMatrixScaleQuestion("social.affective-distance", 7),
      ...nextGeneralQuestions(3),
    ]),
    createSection("media-information-habits", "매체 이용 · 정보 습관", [
      createMatrixChoiceQuestion("media.daily-use-duration", 3),
      ...nextGeneralQuestions(4),
    ]),
  ];

  return {
    status: "PENDING",
    roundId: ROUND_ID,
    contentVersionId: CONTENT_VERSION_ID,
    sections,
  };
}

function createSection(
  sectionKey: string,
  title: string,
  questions: SurveyQuestion[],
): SurveySection {
  return { sectionKey, title, questions };
}

function createGeneralQuestion(index: number): SurveyQuestion {
  const base = {
    questionId: uuid(100 + index),
    questionKey: index === 2 ? "demographics.residence" : `e2e.question-${index}`,
    title: `문항 ${index}`,
    prompt: `문항 ${index} 답변`,
    required: !OPTIONAL_GENERAL_QUESTION_INDEXES.has(index),
  } as const;

  switch (index % 6) {
    case 0:
      return { ...base, type: "SINGLE_CHOICE", options: createOptions(index) };
    case 1:
      return {
        ...base,
        type: "MULTIPLE_CHOICE",
        minimumSelections: 1,
        maximumSelections: 2,
        options: createOptions(index),
      };
    case 2:
      return { ...base, type: "SHORT_TEXT", maxLength: 100 };
    case 3:
      return { ...base, type: "LONG_TEXT", maxLength: 500 };
    case 4:
      return { ...base, type: "NUMBER", minimum: null, maximum: null, decimalScale: 0 };
    default:
      return {
        ...base,
        type: "SCALE",
        minimum: 0,
        maximum: 10,
        minimumLabel: "낮음",
        maximumLabel: "높음",
      };
  }
}

function createMatrixChoiceQuestion(questionKey: string, itemCount: number): SurveyQuestion {
  const index = questionKey === "household.age-group-presence" ? 201 : 202;
  return {
    questionId: uuid(index),
    questionKey,
    title: "행렬 단일 선택",
    prompt: "각 항목을 선택해 주세요.",
    required: true,
    type: "MATRIX_SINGLE_CHOICE",
    items: createItems(index, itemCount),
    options: createOptions(index),
  };
}

function createMatrixScaleQuestion(questionKey: string, itemCount: number): SurveyQuestion {
  const index = 203;
  return {
    questionId: uuid(index),
    questionKey,
    title: "행렬 척도",
    prompt: "각 항목의 척도를 선택해 주세요.",
    required: true,
    type: "MATRIX_SCALE",
    items: createItems(index, itemCount),
    minimum: 0,
    maximum: 10,
    minimumLabel: "낮음",
    maximumLabel: "높음",
  };
}

function createItems(seed: number, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    itemId: uuid(seed * 100 + index + 1),
    itemKey: `item-${index + 1}`,
    itemLabel: `항목 ${index + 1}`,
  }));
}

function createOptions(seed: number) {
  return [
    { optionId: uuid(seed * 100 + 81), label: "선택지 A" },
    { optionId: uuid(seed * 100 + 82), label: "선택지 B" },
  ];
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
