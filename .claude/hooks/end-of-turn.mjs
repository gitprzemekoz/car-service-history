#!/usr/bin/env node
// Stop: sweep everything this turn changed before the agent finishes; one retry.
// Lint changed files (also those rewritten via Bash, which never reach PostToolUse),
// run the whole unit suite (~2 s), then `astro check` (syncs .astro/ itself, covers .astro files like CI).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const LINTED = /\.(ts|tsx|js|jsx|mjs|cjs|astro)$/i;
const MAX_OUTPUT = 6000;

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const env = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };

let payload = {};
try {
  payload = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  payload = {};
}

// Already sent back once by this hook: let it finish. The commit gate (lint-staged) and CI catch the rest.
// (loop_count covers Cursor, which imports .claude/settings.json hooks.)
if (payload?.stop_hook_active === true || Number(payload?.loop_count ?? 0) > 0) process.exit(0);

const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" }).stdout ?? "";
const changed = [
  ...new Set(
    (git(["diff", "--name-only", "HEAD"]) + "\n" + git(["ls-files", "-o", "--exclude-standard"]))
      .split(/\r?\n/)
      .filter(Boolean),
  ),
];
// Nothing changed (a Q&A turn): nothing to check.
if (changed.length === 0) process.exit(0);

const run = (bin, args) => {
  const r = spawnSync(process.execPath, [path.join(root, bin), ...args], { cwd: root, encoding: "utf8", env });
  // astro check colours its diagnostics even with NO_COLOR; the model reads this, so strip ANSI.
  // eslint-disable-next-line no-control-regex
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.replace(/\x1b\[[0-9;]*m/g, "").trim();
  return { ok: r.status === 0, out: out.length > MAX_OUTPUT ? `${out.slice(0, MAX_OUTPUT)}\n…(truncated)` : out };
};

const report = [];
const files = changed.filter((f) => LINTED.test(f) && existsSync(path.join(root, f)));

if (files.length > 0) {
  const lint = run("node_modules/eslint/bin/eslint.js", ["--quiet", "--no-warn-ignored", ...files]);
  if (!lint.ok) report.push(`ESLint errors in changed files:\n${lint.out}`);

  const tests = run("node_modules/vitest/vitest.mjs", ["run"]);
  if (!tests.ok) report.push(`Unit tests fail (npm test):\n${tests.out}`);

  const check = run("node_modules/astro/bin/astro.mjs", ["check"]);
  if (!check.ok) report.push(`astro check fails:\n${check.out}`);
}

if (report.length > 0) {
  process.stderr.write(`Fix these before you finish:\n\n${report.join("\n\n")}\n`);
  process.exit(2);
}
process.exit(0);
