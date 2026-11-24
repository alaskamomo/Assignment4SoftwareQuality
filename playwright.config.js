import { defineConfig, devices } from "@playwright/test";

const PORT = 5173;

export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.js",
  globalSetup: "./tests/playwright.globalSetup.js",
  // Raw Playwright artifacts go here; the evidence we submit is copied into test-results/
  outputDir: "playwright-artifacts",
  reporter: [["list"]],
  timeout: 15000,
  expect: { timeout: 5000 }, // retrying assertions wait up to 5 s, no fixed sleeps
  use: {
    baseURL: `http://localhost:${PORT}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node src/server.js",
    url: `http://localhost:${PORT}/courses/health`,
    env: { NODE_ENV: "test", PORT: String(PORT), LOG_FILE: "test-results/server.log" },
    reuseExistingServer: false,
  },
});
