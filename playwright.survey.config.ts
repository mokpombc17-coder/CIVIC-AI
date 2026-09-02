import { defineConfig, devices } from "@playwright/test";

const WEB_BASE_URL = process.env.SURVEY_E2E_WEB_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "survey-*.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  outputDir: "./e2e/.artifacts/survey-results",
  reporter: [["list"]],
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
      use: devices["Desktop Chrome"],
    },
  ],
});
