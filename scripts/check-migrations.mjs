import { execFileSync } from "node:child_process";

// A migration that has reached main may already be applied in production.
// Only additions are safe; edits, deletions and renames need a new migration.
const base = process.argv[2];

if (!base || /^0+$/.test(base)) {
  console.log("No previous revision; migration immutability check skipped.");
} else {
  const changes = execFileSync(
    "git",
    [
      "diff",
      "--name-status",
      "--no-renames",
      "--diff-filter=MD",
      base,
      "HEAD",
      "--",
      "packages/api/migrations/",
    ],
    { encoding: "utf8" },
  );

  if (changes.trim()) {
    console.error(
      "Existing migrations are immutable. Add a new numbered SQL file instead:\n" + changes,
    );
    process.exitCode = 1;
  }
}
