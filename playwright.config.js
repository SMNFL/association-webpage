import { defineConfig } from "@playwright/test";

const e2ePort = process.env.E2E_PORT || "8090";
const e2eBaseUrl = process.env.E2E_BASE_URL || `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: e2eBaseUrl,
    trace: "retain-on-failure"
  },
  webServer: {
    command: `NODE_ENV=test PORT=${e2ePort} node tests/support/e2e-server.js`,
    url: `${e2eBaseUrl}/healthz`,
    reuseExistingServer: false,
    timeout: 20_000
  }
});
