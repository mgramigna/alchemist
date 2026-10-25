import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: process.env.ALCHEMIST_ORIGIN ?? "http://localhost:1337",
    browserName: "chromium",
    launchOptions: { args: ["--no-sandbox"] },
  },
});
