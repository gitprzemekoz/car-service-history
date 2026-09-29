import { defineConfig } from "vitest/config";

// DB-integration suite: runs only via `npm run test:db`, against a running local Supabase.
// One file at a time so the fixture's sign-ups are not duplicated (auth rate limit).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
