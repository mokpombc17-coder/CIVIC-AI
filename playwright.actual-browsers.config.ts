import { defineConfig, devices } from "@playwright/test";

const WEB_BASE_URL = "https://localhost:3110";
const MOCK_API_URL = "http://127.0.0.1:4792";

export default defineConfig({
  testDir: "./e2e/actual",
  testMatch: "installed-browser-smoke.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  reporter: "list",
  outputDir: "./e2e/.artifacts/actual-browser-results",
  use: {
    baseURL: WEB_BASE_URL,
    ignoreHTTPSErrors: true,
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "pnpm --filter @app/web exec next dev --experimental-https --hostname localhost --port 3110",
    reuseExistingServer: false,
    env: {
      CIVIC_BROWSER_ORIGIN: WEB_BASE_URL,
      MAIN_AUTH_INTERNAL_URL: MOCK_API_URL,
      RAG_INTERNAL_URL: MOCK_API_URL,
    },
    ignoreHTTPSErrors: true,
    timeout: 120_000,
    url: WEB_BASE_URL,
  },
  projects: [
    {
      name: "chrome-installed",
      grep: /@chrome/,
      use: {
        ...devices["Desktop Chrome"],
        headless: false,
        launchOptions: {
          executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        },
      },
    },
    {
      name: "edge-installed",
      grep: /@edge/,
      use: {
        ...devices["Desktop Chrome"],
        headless: false,
        launchOptions: {
          executablePath:
            process.env.CIVIC_EDGE_EXECUTABLE ??
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        },
      },
    },
  ],
});
