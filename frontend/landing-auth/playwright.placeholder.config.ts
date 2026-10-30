import { defineConfig, devices } from "@playwright/test";

const WEB_BASE_URL = "https://localhost:3107";
const MAIN_AUTH_URL = "http://127.0.0.1:4787";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "placeholder-access-control.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  outputDir: "./e2e/.artifacts/placeholder-results",
  reporter: "list",
  retries: 0,
  timeout: 45_000,
  workers: 1,
  expect: { timeout: 15_000 },
  use: {
    baseURL: WEB_BASE_URL,
    ignoreHTTPSErrors: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "pnpm --filter @app/web exec next dev --experimental-https --hostname localhost --port 3107",
    env: {
      MAIN_AUTH_INTERNAL_URL: MAIN_AUTH_URL,
    },
    reuseExistingServer: false,
    ignoreHTTPSErrors: true,
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
