import { defineConfig, devices } from "@playwright/test";

const WEB_BASE_URL = process.env.E2E_WEB_BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
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
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: WEB_BASE_URL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "PORT=3100 pnpm dev:web",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: WEB_BASE_URL,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
