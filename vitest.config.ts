import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*"],
    // Show console output only for failing tests.
    silent: "passed-only",
  },
});
