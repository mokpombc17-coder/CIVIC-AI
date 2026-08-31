import { expect, test } from "@playwright/test";

test("루트는 공개 홈으로 직접 이동한다", async ({ page }) => {
  const response = await page.request.get("/", { maxRedirects: 0 });

  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe("/home");

  await page.goto("/");
  await expect(page).toHaveURL(/\/home$/u);
  await expect(page.getByRole("heading", { name: "CIVIC.AI", exact: true })).toBeVisible();
});

test("비로그인 사용자는 홈을 보고 보호 기능 링크에서 로그인으로 이동한다", async ({ page }) => {
  await page.goto("/home");

  await expect(page).toHaveURL(/\/home$/u);
  await expect(page.getByRole("heading", { name: "CIVIC.AI", exact: true })).toBeVisible();
  const loginAction = page.getByRole("link", { name: "로그인", exact: true });
  await expect(loginAction).toHaveAttribute("href", "/login?returnTo=%2Fhome");
  await expect(loginAction).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(loginAction).toHaveCSS("border-top-width", "0px");
  await expect(loginAction).toHaveCSS("color", "rgb(31, 33, 36)");
  await expect(loginAction).toHaveCSS("font-weight", "700");
  await expect(loginAction).toHaveCSS("min-height", "44px");
  await expect(page.getByRole("link", { name: "홈", exact: true })).toHaveAttribute(
    "href",
    "/home",
  );
  await expect(page.getByRole("link", { name: "AI", exact: true })).toHaveAttribute(
    "href",
    "/login?returnTo=%2Frag",
  );
  await expect(page.getByRole("link", { name: "투표하기", exact: true })).toHaveAttribute(
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
  await expect(page.getByRole("link", { name: "투표하기", exact: true })).toHaveAttribute(
    "href",
    "/votes",
  );
});

test("로그인 실제 UI를 공통 Platform Shell 안에 렌더링한다", async ({ page }) => {
  await page.setViewportSize({ height: 852, width: 393 });
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "로그인", exact: true })).toBeVisible();
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.getByRole("navigation", { name: "참여자 주요 메뉴" })).toHaveCount(0);

  const shell = page.locator('[data-platform-shell="true"]');
  await expect(shell).toHaveCount(1);
  await expect(shell).toBeVisible();
  expect((await shell.boundingBox())?.width).toBeLessThanOrEqual(393);

  const typography = await page.locator('[data-wireflow-layout="auth-login"]').evaluate((root) => {
    const read = (selector: string) => {
      const element = root.querySelector(selector);
      if (!(element instanceof HTMLElement)) throw new Error(`${selector} is missing`);
      const style = getComputedStyle(element);
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
      };
    };
    return {
      cardTitle: read(".wf-card-heading h2"),
      fieldLabel: read(".civic-field > span"),
      input: read(".civic-field input"),
      primaryAction: read(".civic-auth-submit"),
      secondaryAction: read(".civic-auth-support-row .wf-button"),
    };
  });

  expect(typography).toEqual({
    cardTitle: {
      fontFamily: '"Pretendard GOV", Pretendard, "Apple SD Gothic Neo", sans-serif',
      fontSize: "18px",
      fontWeight: "700",
      lineHeight: "27px",
    },
    fieldLabel: {
      fontFamily: '"Pretendard GOV", Pretendard, "Apple SD Gothic Neo", sans-serif',
      fontSize: "15px",
      fontWeight: "700",
      lineHeight: "22.5px",
    },
    input: {
      fontFamily: '"Pretendard GOV", Pretendard, "Apple SD Gothic Neo", sans-serif',
      fontSize: "16px",
      fontWeight: "400",
      lineHeight: "19.2px",
    },
    primaryAction: {
      fontFamily: '"Pretendard GOV", Pretendard, "Apple SD Gothic Neo", sans-serif',
      fontSize: "16px",
      fontWeight: "700",
      lineHeight: "20px",
    },
    secondaryAction: {
      fontFamily: '"Pretendard GOV", Pretendard, "Apple SD Gothic Neo", sans-serif',
      fontSize: "14px",
      fontWeight: "700",
      lineHeight: "17.5px",
    },
  });

  const formBox = await page.locator(".wf-auth-form").boundingBox();
  const supportButtons = await page.locator(".civic-auth-support-row .wf-button").all();
  expect(formBox).toEqual({ height: 307, width: 361, x: 16, y: 80 });
  expect(await supportButtons[0]?.boundingBox()).toEqual({
    height: 48,
    width: 176.5,
    x: 16,
    y: 403,
  });
  expect(await supportButtons[1]?.boundingBox()).toEqual({
    height: 48,
    width: 176.5,
    x: 200.5,
    y: 403,
  });
  await expect(page.getByRole("link", { name: "계정 재활성화", exact: true })).toHaveCount(0);
});

test("공통 Shell은 모바일 viewport와 데스크톱 frame 배경을 원본과 동일하게 유지한다", async ({
  page,
}) => {
  await page.setViewportSize({ height: 800, width: 480 });
  await page.goto("/home");
  await expect(page.getByText("배우고, 함께 토론하고, 결정합니다.")).toBeVisible();

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
