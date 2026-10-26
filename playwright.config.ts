import { defineConfig } from "@playwright/test";

// Sheet capture also runs in Firefox. WebKit needs local HTTPS for Secure cookies;
// it is intentionally excluded rather than weakening the application's cookies.
const capture = /sheet-download\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://localhost:1338",
    trace: "retain-on-failure",
  },
  // Always own a separate stack: never silently test a developer's populated DB.
  webServer: {
    command: `bun run build && bun alchemy dev --config alchemy.e2e.ts --stage e2e-${crypto.randomUUID()}`,
    url: "http://localhost:1338",
    env: { APP_ORIGIN: "http://localhost:1338" },
    reuseExistingServer: false,
    timeout: 180_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium", launchOptions: { args: ["--no-sandbox"] } },
    },
    { name: "firefox", use: { browserName: "firefox" }, testMatch: capture },
  ],
});
