import type { Browser, Page } from "@playwright/test";

const TILE_WINDOWS_ENV = "CHAT_E2E_TILE_WINDOWS";
const TWO_WINDOW_WIDTH = 680;
const THREE_WINDOW_WIDTH = 440;
const WINDOW_GAP = 8;
const WINDOW_HEIGHT = 800;
const WINDOW_TOP = 32;

const registeredPages = new WeakMap<Browser, Page[]>();
const layoutTasks = new WeakMap<Browser, Promise<void>>();

export async function registerE2EWindow(page: Page): Promise<void> {
  if (process.env[TILE_WINDOWS_ENV] !== "true") {
    return;
  }

  const browser = page.context().browser();

  if (!browser) {
    throw new Error("E2E 창 타일링에는 Playwright Browser 인스턴스가 필요합니다.");
  }

  if (browser.browserType().name() !== "chromium") {
    throw new Error("E2E 창 타일링은 Chromium 프로젝트에서만 지원합니다.");
  }

  const pages = (registeredPages.get(browser) ?? []).filter((registeredPage) => {
    return !registeredPage.isClosed();
  });

  if (!pages.includes(page)) {
    pages.push(page);
  }

  registeredPages.set(browser, pages);

  const previousTask = layoutTasks.get(browser) ?? Promise.resolve();
  const layoutTask = previousTask
    .catch(() => undefined)
    .then(async () => {
      await tileBrowserWindows(browser, pages);
    });

  layoutTasks.set(browser, layoutTask);
  await layoutTask;
}

async function tileBrowserWindows(browser: Browser, pages: readonly Page[]): Promise<void> {
  const browserSession = await browser.newBrowserCDPSession();

  try {
    for (const [index, page] of pages.entries()) {
      const pageSession = await page.context().newCDPSession(page);

      try {
        const { targetInfo } = await pageSession.send("Target.getTargetInfo");
        const { windowId } = await browserSession.send("Browser.getWindowForTarget", {
          targetId: targetInfo.targetId,
        });
        const bounds = resolveWindowBounds(pages.length, index);

        await browserSession.send("Browser.setWindowBounds", {
          windowId,
          bounds: { windowState: "normal" },
        });
        await browserSession.send("Browser.setWindowBounds", {
          windowId,
          bounds,
        });
      } finally {
        await pageSession.detach();
      }
    }
  } finally {
    await browserSession.detach();
  }
}

function resolveWindowBounds(total: number, index: number) {
  const columns = total >= 3 ? 3 : 2;
  const width = total >= 3 ? THREE_WINDOW_WIDTH : TWO_WINDOW_WIDTH;
  const column = index % columns;
  const row = Math.floor(index / columns);

  return {
    height: WINDOW_HEIGHT,
    left: column * (width + WINDOW_GAP),
    top: WINDOW_TOP + row * (WINDOW_HEIGHT + WINDOW_GAP),
    width,
  };
}
