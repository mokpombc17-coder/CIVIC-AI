import { expect, test } from "@playwright/test";

test("홈에서 공통 Platform Shell을 렌더링한다", async ({ page }) => {
  await page.goto("/home");

  await expect(page.getByRole("heading", { name: "홈", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "참여자 주요 메뉴" })).toBeVisible();
  await expect(page.getByRole("link", { name: "홈", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );

  const shell = page.locator('[data-platform-shell="true"]');
  await expect(shell).toBeVisible();
  expect((await shell.boundingBox())?.width).toBeLessThanOrEqual(393);
});

test("구현되지 않은 경로도 공통 404 Shell을 사용한다", async ({ page }) => {
  await page.goto("/not-implemented");

  await expect(page.getByRole("heading", { name: "페이지 없음", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "경로를 찾을 수 없습니다." })).toBeVisible();
  await expect(page.locator('[data-platform-shell="true"]')).toBeVisible();
});
