import { expect, test, type Page } from "@playwright/test";
import { issueLocalE2EAuthenticationSession } from "./chat-e2e-helpers";

test("현재 Task 제출 조회 계약으로 기존 응답을 표시한다", async ({ page }) => {
  await issueLocalE2EAuthenticationSession(page.request, "local-user-1");
  await page.goto("/vote");

  const responseLink = page.getByRole("link", { name: / 응답 보기$/ }).first();
  await expect(responseLink).toBeVisible();

  const submissionResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && url.pathname === "/api/v1/me/submissions";
  });

  await responseLink.click();

  const submissionResponse = await submissionResponsePromise;
  expect(submissionResponse.status()).toBe(200);

  const submission = (await submissionResponse.json()) as {
    finalReason?: unknown;
    personaVersionId?: unknown;
  };
  expect(submission).not.toHaveProperty("personaVersionId");
  expect(typeof submission.finalReason).toBe("string");

  await expect(page.getByText("제출 완료", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "내 제출", exact: true })).toBeVisible();
  await expect(page.getByText("선택지", { exact: true })).toBeVisible();
  await expect(page.getByText("이유", { exact: true })).toBeVisible();
  await expect(page.getByText("4/4", { exact: true })).toHaveCount(0);
  await expect(page.getByText(String(submission.finalReason), { exact: true })).toBeVisible();
  await expect(
    page.getByText("제출한 응답을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."),
  ).toHaveCount(0);
});

test("personaVersionId 없는 Prediction 계약으로 응답 작성을 시작한다", async ({ page }) => {
  await issueLocalE2EAuthenticationSession(page.request, "local-user-1");
  await page.goto("/vote");

  const participationLink = page.getByRole("link", { name: / 참여하기$/ }).first();
  await expect(participationLink).toBeVisible();

  const predictionResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && url.pathname.endsWith("/prediction");
  });

  await participationLink.click();

  const predictionResponse = await predictionResponsePromise;
  expect(predictionResponse.status()).toBe(200);
  expect(await predictionResponse.json()).not.toHaveProperty("personaVersionId");

  await expect(page.getByRole("button", { name: "참여하기", exact: true })).toBeEnabled();
});

// 백엔드 상태를 직접 만들 수 없으므로 실제 Prediction 응답을 받아 상태 필드만 바꿔 돌려줌
const UNAVAILABLE_PREDICTION = {
  predictionRequestAllowed: false,
  runtimeStatus: null,
  submissionAllowed: false,
  waiting: false,
} as const;

test("AI 예상 답변 준비가 실패하면 다시 시도 버튼으로 예측을 다시 요청한다", async ({ page }) => {
  await openParticipationWithPrediction(page, { ...UNAVAILABLE_PREDICTION, state: "FAILED" });
  await expect(
    page.getByText("AI 예상 답변을 준비하지 못했습니다.", { exact: false }),
  ).toBeVisible();

  // 실제 예측 요청을 쌓지 않도록 다시 요청은 보낸 것만 확인하고 중단함
  const ensureRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" && new URL(request.url()).pathname.endsWith("/prediction"),
  );
  await page.route(
    (url) => url.pathname.endsWith("/prediction"),
    (route) => (route.request().method() === "POST" ? route.abort() : route.fallback()),
  );
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();

  await ensureRequestPromise;
});

test("페르소나를 준비하는 동안에는 준비 중으로 안내하고 버튼을 두지 않는다", async ({ page }) => {
  await openParticipationWithPrediction(page, {
    ...UNAVAILABLE_PREDICTION,
    state: "PERSONA_NOT_READY",
  });

  await expect(page.getByText("투표 참여 정보를 준비 중입니다.", { exact: true })).toBeVisible();
  await expect(page.getByText("현재 응답을 작성할 수 없습니다.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /참여하기|다시 시도|준비 중/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "목록으로", exact: true })).toHaveCount(0);
});

test("참여할 수 없는 상태에서는 준비 중 버튼 대신 목록으로 링크를 표시한다", async ({ page }) => {
  await openParticipationWithPrediction(page, { ...UNAVAILABLE_PREDICTION, state: "TASK_CLOSED" });

  await expect(page.getByText("현재 응답을 작성할 수 없습니다.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /준비 중/ })).toHaveCount(0);
  const listLink = page.getByRole("link", { name: "목록으로", exact: true });
  await expect(listLink).toBeVisible();
  await expect(listLink).toHaveAttribute("href", "/vote");
});

async function openParticipationWithPrediction(
  page: Page,
  override: Readonly<Record<string, unknown>>,
) {
  await issueLocalE2EAuthenticationSession(page.request, "local-user-1");
  await page.route(
    (url) => url.pathname.endsWith("/prediction"),
    async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }

      const response = await route.fetch();
      const body = (await response.json()) as Record<string, unknown>;
      await route.fulfill({ json: { ...body, ...override }, response });
    },
  );
  await page.goto("/vote");

  const participationLink = page.getByRole("link", { name: / 참여하기$/ }).first();
  await expect(participationLink).toBeVisible();
  await participationLink.click();
  await expect(page.getByText("1/4", { exact: true })).toBeVisible();
}
