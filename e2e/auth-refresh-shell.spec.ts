import { expect, test } from "@playwright/test";

test.describe("참가자 인증 갱신 shell", () => {
  for (const target of [
    { activeHref: "/rag", returnTo: "/rag?question=local", title: "AI" },
    { activeHref: "/mypage", returnTo: "/mypage", title: "계정" },
  ]) {
    test(`${target.returnTo} 갱신 중 목적지 shell을 유지한다`, async ({ page }) => {
      let releaseRefresh: (() => void) | undefined;
      const refreshPending = new Promise<void>((resolve) => {
        releaseRefresh = resolve;
      });

      await page.route("**/api/v1/auth/refresh", async (route) => {
        await refreshPending;
        await route.abort("failed");
      });
      await page.setViewportSize({ height: 800, width: 1280 });
      await page.goto(`/auth/refresh?returnTo=${encodeURIComponent(target.returnTo)}`);

      const shell = page.locator('[data-platform-shell="true"]');
      await expect(shell).toBeVisible();
      await expect(page.getByRole("heading", { name: target.title })).toBeVisible();
      await expect(
        page.locator(`[aria-current="page"][href="${target.activeHref}"]`),
      ).toBeVisible();
      await expect(page.locator('[data-fullscreen-status="true"]')).toHaveCount(0);

      expect(await shell.evaluate((element) => element.getBoundingClientRect().width)).toBe(393);

      releaseRefresh?.();
      await expect(
        page.getByRole("heading", { name: "인증 서버에 연결하지 못했습니다." }),
      ).toBeVisible();
    });
  }
});

test("관리자 인증 갱신 중 참가자 모바일 셸을 노출하지 않는다", async ({ page }) => {
  let releaseRefresh: (() => void) | undefined;
  const refreshPending = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });

  await page.route("**/api/v1/auth/refresh", async (route) => {
    await refreshPending;
    await route.abort("failed");
  });
  await page.setViewportSize({ height: 800, width: 1280 });
  await page.goto("/auth/refresh?returnTo=%2Fadmin%2Frag");

  const statusHeading = page.getByRole("heading", {
    name: "로그인 상태를 확인하고 있습니다.",
  });
  await expect(statusHeading).toBeVisible();
  const status = statusHeading.locator("xpath=ancestor::section[@data-fullscreen-status='true']");
  await expect(status).toBeVisible();
  await expect(page.locator('[data-platform-shell="true"]')).toHaveCount(0);
  await expect(page.locator('[data-wireflow-shell="admin"]')).toHaveCount(0);

  expect(await status.evaluate((element) => element.getBoundingClientRect().width)).toBe(1280);

  releaseRefresh?.();
  await expect(
    page.getByRole("heading", { name: "인증 서버에 연결하지 못했습니다." }),
  ).toBeVisible();
});
