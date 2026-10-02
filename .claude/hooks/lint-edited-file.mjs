#!/usr/bin/env node
// PostToolUse (Write|Edit): lint only the file the agent just edited.
// Exit 2 + stderr is the only combination Claude sees. Node instead of bash: no jq on this machine.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Extensions covered by eslint.config.js (typescript-eslint, react, eslint-plugin-astro, scripts/*.mjs).
const LINTED = /\.(ts|tsx|js|jsx|mjs|cjs|astro)$/i;

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

let payload = {};
try {
  payload = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  process.exit(0); // unparseable payload: nothing to check
}

const file = payload?.tool_input?.file_path ?? payload?.tool_input?.path;
if (typeof file !== "string" || !LINTED.test(file) || !existsSync(file)) process.exit(0);

const result = spawnSync(
  process.execPath,
  [path.join(root, "node_modules/eslint/bin/eslint.js"), "--quiet", "--no-warn-ignored", file],
  { cwd: root, encoding: "utf8", env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" } },
);

if (result.status !== 0) {
  process.stderr.write(`ESLint reported errors in ${file}:\n${result.stdout}${result.stderr}`);
  process.exit(2);
}
process.exit(0);
