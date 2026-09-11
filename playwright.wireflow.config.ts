import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = process.env.CIVIC_E2E_WEB_PORT ?? "3109";
const WEB_BASE_URL = process.env.CIVIC_E2E_WEB_BASE_URL ?? `https://localhost:${WEB_PORT}`;
const MOCK_API_PORT = process.env.CIVIC_E2E_ADMIN_MOCK_PORT ?? "4791";
const MOCK_API_URL = `http://127.0.0.1:${MOCK_API_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "wireflow-gui.spec.ts",
    "accessibility/all-canonical-routes.spec.ts",
    "critical/main-admin-users.spec.ts",
    "critical/main-auth-lifecycle.spec.ts",
    "critical/admin-domain-console.spec.ts",
    "pwa-install-guide.spec.ts",
  ],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  outputDir: "./e2e/.artifacts/wireflow-results",
  reporter: "list",
  retries: 0,
  timeout: 45_000,
  workers: 1,
  expect: { timeout: 15_000 },
  use: {
    baseURL: WEB_BASE_URL,
    ignoreHTTPSErrors: true,
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 394, height: 853 },
  },
  webServer: {
    command: `corepack pnpm --filter @app/web exec next dev --experimental-https --hostname localhost --port ${WEB_PORT}`,
    reuseExistingServer: false,
    env: {
      CIVIC_BROWSER_ORIGIN: WEB_BASE_URL,
      MAIN_AUTH_INTERNAL_URL: MOCK_API_URL,
      CIVIC_E2E_RAG_UPSTREAM: MOCK_API_URL,
      CIVIC_DEV_SIMULATION_UPSTREAM: MOCK_API_URL,
      CHAT_INTERNAL_URL: MOCK_API_URL,
      VOTE_INTERNAL_URL: MOCK_API_URL,
    },
    ignoreHTTPSErrors: true,
    timeout: 120_000,
    url: WEB_BASE_URL,
  },
  projects: [
    {
      name: "chromium-mobile-wireflow",
      use: {
        ...devices["Desktop Chrome"],
        reducedMotion: "reduce",
        viewport: { width: 394, height: 853 },
      },
    },
  ],
});
