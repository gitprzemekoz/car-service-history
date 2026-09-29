import { defineConfig } from "vitest/config";

// HTTP-integration suite: runs only via `npm run test:http`, against a running preview plus local Supabase.
// One file at a time so fixture sign-ups and app sign-ins stay well under the auth rate limit.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/http/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Vitest puts Vite's BASE_URL ("/") into process.env; forward the shell's value (or the default) instead.
    env: { BASE_URL: process.env.BASE_URL ?? "http://localhost:4321" },
  },
});
