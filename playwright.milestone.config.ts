import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.CIVIC_E2E_ORIGIN ?? "http://localhost:3300";
const requestedChannel = process.env.CIVIC_E2E_BROWSER_CHANNEL;
if (requestedChannel && requestedChannel !== "chrome" && requestedChannel !== "msedge") {
  throw new Error(`unsupported CIVIC_E2E_BROWSER_CHANNEL: ${requestedChannel}`);
}
const channel = requestedChannel as "chrome" | "msedge" | undefined;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "critical/main-rag-first-milestone.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  outputDir: process.env.CIVIC_E2E_ARTIFACT_DIR ?? "./e2e/.artifacts/milestone-results",
  reporter: [["list"]],
  retries: 0,
  timeout: 180_000,
  workers: 1,
  expect: { timeout: 30_000 },
  use: {
    baseURL,
    // This security journey handles credentials and document/question canaries.
    // Persisted text logs are scanned; raw browser recordings are intentionally disabled.
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  projects: [
    {
      name: `${channel ?? "chromium"}-real-stack`,
      use: { ...devices["Desktop Chrome"], ...(channel ? { channel } : {}) },
    },
  ],
});
