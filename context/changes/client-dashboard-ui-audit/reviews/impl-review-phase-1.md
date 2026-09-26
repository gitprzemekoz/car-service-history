<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Client dashboard UI audit

- **Plan**: context/changes/client-dashboard-ui-audit/plan.md
- **Scope**: Phase 1 of 4
- **Reviewed phases**: 1
- **Date**: 2026-09-26
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Notes: The claim "rendered HTML of `/dashboard` unchanged" was checked class by class against `52e0f4f^` and holds. The five disclosed adaptations were accepted during implementation, so they are not findings: the `autofocusSignOut` prop, `loadError={false}`, the ESLint disable, the kitchen-sink styles, and the screenshot script using the Chrome DevTools Protocol (CDP) instead of `--screenshot` flags. `/dev/dashboard-states` is SSR-only (`output: "server"`, no prerender) and returns 404 when `import.meta.env.DEV` is false.

## Findings

### F1 — Screenshot script silently captures error pages

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/screenshot-states.mjs:66-68
- **Detail**: The script never checks `Page.navigate`'s `errorText` or the HTTP status. If the dev server is down, or the script runs against `astro preview` (where the route returns 404), Edge still fires the load event, and the script writes a PNG of the error page and prints "wrote …". The visual gate would then judge the wrong image.
- **Fix**: Before launching Edge, `fetch(url)` and require status 200, with an error message that names `npm run dev`. Also throw when the navigate result has `errorText`.
- **Decision**: PENDING

### F2 — No spawn-error handler or timeouts in screenshot script

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/screenshot-states.mjs:34-47, 102-135
- **Detail**: A wrong `EDGE_PATH` (ENOENT) raises an unhandled `error` event on the spawned process. That crashes Node before `finally` runs and leaks the temporary profile folder. `cdp.send` and `cdp.once` have no timeout, and closing the WebSocket does not reject pending promises. If Edge crashes or the load event never fires, the script hangs forever.
- **Fix**: Add an `edge.once("error", …)` handler that rejects. Wrap `send` and `once` in a timeout of about 30s. When the WebSocket closes, reject everything still pending.
- **Decision**: PENDING

### F3 — Tie-break fixture doesn't exercise the tie-break

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/dev/dashboard-states.astro:18-55
- **Detail**: The plan requires "one on the same day to show the tie-break". e-1 (created 10:00) already comes before e-3 (created 08:00) in the array. Because `Array.sort` is stable, the output order would be the same even without the `created_at` comparison in `ServiceHistory.astro:12`. The kitchen sink therefore can't catch a regression in the tie-break that Phase 3 moves into `sortNewestFirst`.
- **Fix**: Put e-3 before e-1 in the fixture array, so only the `created_at` tie-break produces the order shown.
- **Decision**: PENDING

### F4 — Profile cleanup in `finally` can mask the real error

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/screenshot-states.mjs:83-86
- **Detail**: On Windows, `edge.kill()` stops only the main msedge process. Its child processes can keep the profile folder locked. If `rm` still fails after its retries, it throws from `finally` and replaces the original error.
- **Fix**: Wrap the `rm` in try/catch and log a warning instead of throwing.
- **Decision**: PENDING

### F5 — ESLint rule crashes on frontmatter `return`, disabled per file

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dev/dashboard-states.astro:7-8
- **Detail**: `@typescript-eslint/no-misused-promises` crashes ("Expected node to have a parent") on a top-level frontmatter `return new Response(...)`. The file disables the rule for the whole file, with the reason in a comment. Any future page that uses the same dev-only 404 guard will hit this crash.
- **Fix**: Record it as a lesson, or scope the override to `src/pages/dev/**` in `eslint.config`.
- **Decision**: PENDING
