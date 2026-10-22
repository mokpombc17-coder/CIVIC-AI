import { expect, test } from "@playwright/test";
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
