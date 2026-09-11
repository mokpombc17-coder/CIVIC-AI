import { defineConfig, devices } from "@playwright/test";

const WEB_BASE_URL = process.env.WEBKIT_E2E_WEB_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "webkit-css-smoke.spec.ts",
  fullyParallel: false,
  outputDir: "./e2e/.artifacts/webkit-results",
  reporter: [["list"]],
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  workers: 1,
  expect: {
    timeout: 20_000,
  },
  use: {
    ...devices["iPhone 13"],
    baseURL: WEB_BASE_URL,
    browserName: "webkit",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev:web",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: WEB_BASE_URL,
  },
});
