import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.integration.test.js"],
    globalSetup: ["tests/globalSetup.js"],
    env: { NODE_ENV: "test", LOG_FILE: "test-results/server.log" },
    testTimeout: 10000,
  },
});
