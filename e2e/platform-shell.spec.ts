import { expect, test } from "@playwright/test";

test("루트는 공개 홈으로 직접 이동한다", async ({ page }) => {
  const response = await page.request.get("/", { maxRedirects: 0 });

  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe("/home");

  await page.goto("/");
  await expect(page).toHaveURL(/\/home$/u);
  await expect(page.getByRole("heading", { name: "홈", exact: true })).toBeVisible();
});

test("비로그인 사용자는 홈을 보고 보호 기능 링크에서 로그인으로 이동한다", async ({ page }) => {
  await page.goto("/home");

  await expect(page).toHaveURL(/\/home$/u);
  await expect(page.getByRole("heading", { name: "홈", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "홈", exact: true })).toHaveAttribute(
    "href",
    "/home",
  );
  await expect(page.getByRole("link", { name: "AI", exact: true })).toHaveAttribute(
    "href",
    "/login?returnTo=%2Frag",
  );
  await expect(page.getByRole("link", { name: "과업 보기", exact: true })).toHaveAttribute(
    "href",
    "/login?returnTo=%2Fvotes",
  );

  await page.getByRole("link", { name: "AI", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Frag$/u);
  await expect(page.getByRole("heading", { name: "로그인", exact: true })).toBeVisible();
});

test("Access Token 쿠키가 있으면 홈의 보호 기능 링크를 그대로 유지한다", async ({ page }) => {
  await page.context().addCookies([
    {
      name: "civic_ai_access_token",
      value: "header.payload.signature",
      url: "http://localhost:3310",
    },
  ]);

  await page.goto("/home");

  await expect(page.getByRole("link", { name: "AI", exact: true })).toHaveAttribute("href", "/rag");
  await expect(page.getByRole("link", { name: "과업 보기", exact: true })).toHaveAttribute(
    "href",
    "/votes",
  );
});

test("로그인 실제 UI를 공통 Platform Shell 안에 렌더링한다", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "로그인", exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("name@example.com")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "참여자 주요 메뉴" })).toHaveCount(0);

  const shell = page.locator('[data-platform-shell="true"]');
  await expect(shell).toHaveCount(1);
  await expect(shell).toBeVisible();
  expect((await shell.boundingBox())?.width).toBeLessThanOrEqual(393);
});

test("공통 Shell은 모바일 viewport와 데스크톱 frame 배경을 원본과 동일하게 유지한다", async ({
  page,
}) => {
  await page.setViewportSize({ height: 800, width: 480 });
  await page.goto("/home");

  const shell = page.locator('[data-platform-shell="true"]');
  const surface = page.locator('[data-platform-shell-surface="true"]');
  const mobileShell = await shell.evaluate((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      height: box.height,
      width: box.width,
      x: box.x,
    };
  });

  expect(mobileShell).toMatchObject({
    borderRadius: "0px",
    boxShadow: "none",
    height: 800,
    width: 480,
    x: 0,
  });
  expect(await surface.evaluate((element) => getComputedStyle(element).gridTemplateColumns)).toBe(
    "480px",
  );

  const bodyBackground = await page.locator("body").evaluate((element) => {
    const style = getComputedStyle(element);
    return { color: style.backgroundColor, image: style.backgroundImage };
  });
  const htmlBackground = await page
    .locator("html")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  const stageBackground = await page
    .locator('[data-platform-shell-stage="true"]')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(htmlBackground).toBe("rgb(245, 247, 251)");
  expect(bodyBackground.color).toBe("rgb(245, 247, 251)");
  expect(bodyBackground.image).toContain("radial-gradient");
  expect(stageBackground).toBe("rgba(0, 0, 0, 0)");

  await page.setViewportSize({ height: 900, width: 900 });

  const desktopShell = await shell.evaluate((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      borderRadius: style.borderRadius,
      height: box.height,
      width: box.width,
      x: box.x,
    };
  });
  expect(desktopShell).toMatchObject({
    borderRadius: "12px",
    height: 900,
    width: 393,
    x: 253.5,
  });
});

test("구현되지 않은 경로도 공통 404 Shell을 사용한다", async ({ page }) => {
  await page.goto("/not-implemented");

  await expect(page.getByRole("heading", { name: "페이지 없음", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "경로를 찾을 수 없습니다." })).toBeVisible();
  await expect(page.locator('[data-platform-shell="true"]')).toBeVisible();
});
