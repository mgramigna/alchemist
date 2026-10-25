import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tools/browser",
  use: {
    baseURL: process.env.ALCHEMIST_ORIGIN ?? "http://localhost:1337",
    browserName: "chromium",
    launchOptions: { args: ["--no-sandbox"] },
  },
});
