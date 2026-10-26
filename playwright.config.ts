import { defineConfig } from "@playwright/test";

// Capture follows each viewer's engine, so the sheet download checks run in all three.
const capture = /sheet-download\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: process.env.ALCHEMIST_ORIGIN ?? "http://localhost:1337",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium", launchOptions: { args: ["--no-sandbox"] } },
    },
    { name: "firefox", use: { browserName: "firefox" }, testMatch: capture },
    { name: "webkit", use: { browserName: "webkit" }, testMatch: capture },
  ],
});
