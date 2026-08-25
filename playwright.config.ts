import { defineConfig, devices } from "@playwright/test";

const WEB_BASE_URL = process.env.CHAT_E2E_WEB_BASE_URL ?? "http://localhost:3000";
const USE_NATIVE_BROWSER_VIEWPORT = process.env.CHAT_E2E_NATIVE_VIEWPORT === "true";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "./e2e/.artifacts/results",
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: "./e2e/.artifacts/report",
      },
    ],
  ],
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  workers: 1,
  expect: {
    timeout: 20_000,
  },
  use: {
    baseURL: WEB_BASE_URL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev:web",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: WEB_BASE_URL,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(USE_NATIVE_BROWSER_VIEWPORT
          ? {
              deviceScaleFactor: undefined,
              viewport: null,
            }
          : {}),
      },
    },
  ],
});
