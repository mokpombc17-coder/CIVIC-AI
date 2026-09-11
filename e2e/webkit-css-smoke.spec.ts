import { expect, test, type Page } from "@playwright/test";

const COMPLETED_TASK_ID = "727c24f5-7c05-4730-912c-5bb6327c6590";

test("iPhone WebKit에서 구형 CSS fallback과 주요 화면을 표시한다", async ({ page }) => {
  const stripped = await stripModernCssFeatures(page);

  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({ json: { subject: "webkit-css-smoke-user" } });
  });
  await page.route("**/api/v1/me/service-eligibility", async (route) => {
    await route.fulfill({
      json: {
        activeRoundId: null,
        capabilities: ["USE_GENERAL_SERVICE", "USE_PERSONALIZED_SERVICE"],
        eligible: true,
        evaluatedAt: "2026-09-11T00:00:00Z",
        nextAction: null,
        reason: null,
        surveyRequirement: "SATISFIED",
      },
    });
  });
  await page.route("**/api/v1/me/surveys/current", async (route) => {
    await route.fulfill({
      json: {
        status: "PENDING",
        roundId: uuid(1),
        contentVersionId: uuid(2),
        sections: [
          {
            sectionKey: "social-institutional-trust",
            title: "사회 · 기관 신뢰",
            questions: [
              {
                questionId: uuid(3),
                questionKey: "social.affective-distance",
                title: "행렬 척도",
                prompt: "각 항목의 척도를 선택해 주세요.",
                required: true,
                type: "MATRIX_SCALE",
                items: [{ itemId: uuid(4), itemKey: "item-1", itemLabel: "항목 1" }],
                minimum: 0,
                maximum: 10,
                minimumLabel: "낮음",
                maximumLabel: "높음",
              },
            ],
          },
        ],
      },
    });
  });

  await page.goto("/survey");
  const scaleSeven = page.getByText("7", { exact: true });
  await expect(scaleSeven).toBeVisible();
  await scaleSeven.click();

  const selectedScale = page.locator('label[data-selected="true"]');
  await expect(selectedScale).toHaveCount(1);
  await expect(selectedScale.locator("input")).toBeChecked();
  await expect(selectedScale).toHaveCSS("border-color", "rgb(38, 110, 245)");
  await expect(selectedScale).toHaveCSS("background-color", "rgb(237, 242, 255)");
  await expectShellToFillViewport(page);

  expect(stripped.dvh).toBeGreaterThan(0);
  expect(stripped.colorMix).toBeGreaterThan(0);

  await page.goto(`/vote/${COMPLETED_TASK_ID}/result?source=mock`);
  await expect(page.getByRole("heading", { name: "투표 결과보기" })).toBeVisible();
  await expect(
    page.getByText("울산도시철도 1호선 사업을 원안대로 진행해야 한다에 동의하십니까?"),
  ).toBeVisible();
  await expectShellToFillViewport(page);

  const toastTop = await page.evaluate(() => {
    const toast = document.createElement("aside");
    toast.className = "fixed top-[calc(1rem+env(safe-area-inset-top))] sm:top-6";
    toast.dataset.webkitToastProbe = "true";
    document.body.append(toast);
    return getComputedStyle(toast).top;
  });
  expect(toastTop).toBe("16px");
});

async function stripModernCssFeatures(page: Page): Promise<{ dvh: number; colorMix: number }> {
  const counts = { dvh: 0, colorMix: 0 };
  await page.route("**/_next/static/**/*.css", async (route) => {
    const response = await route.fetch();
    let css = await response.text();
    css = css.replace(/[-\w]+:\s*[^;{}]*100dvh[^;{}]*;/g, () => {
      counts.dvh += 1;
      return "";
    });
    css = css.replace(/[-\w]+:\s*[^;{}]*color-mix\([^;{}]+;/g, () => {
      counts.colorMix += 1;
      return "";
    });
    await route.fulfill({ response, body: css });
  });
  return counts;
}

async function expectShellToFillViewport(page: Page): Promise<void> {
  const dimensions = await page.locator('[data-platform-shell="true"]').evaluate((shell) => ({
    shellHeight: shell.getBoundingClientRect().height,
    viewportHeight: window.innerHeight,
  }));
  expect(Math.abs(dimensions.shellHeight - dimensions.viewportHeight)).toBeLessThanOrEqual(1);
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
