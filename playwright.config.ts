import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";
const shouldStartDevServer = baseURL.includes("127.0.0.1") || baseURL.includes("localhost");

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 14"] } }
  ],
  webServer: shouldStartDevServer
    ? [{
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000
      }, {
        command: "node scripts/preview-experience.mjs",
        url: "http://127.0.0.1:5174",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
      }]
    : undefined
});
