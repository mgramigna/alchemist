import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*", { test: { name: "infra", include: ["infra/**/*.test.ts"] } }],
    // Show console output only for failing tests.
    silent: "passed-only",
  },
});
