<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Dashboard data-render protection (test-plan Phase 2)

- **Plan**: context/changes/testing-dashboard-data-render/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-09-29
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 6 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Success criteria evidence:
- Local runs passed: `npm test` (55), `npm run lint`, `npx astro check` (0 errors), `npm run test:db` (58), `npm run smoke`, the marker grep and both `prettier --check` runs.
- CI on PR #12 passed on run 36574889486: `ci` and `smoke`, with `test:http` 23 of 23.
- Local runs that failed for environment reasons (see F7):
  - `npm run build` exits with a libuv assertion on Windows.
  - `npm run test:http` passes 18 of 23 against a stale preview.

## Findings

### F1 — Client-write test's "mechanic list unchanged" check cannot fail

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/http/role-routing.test.ts:100
- **Detail**:
  - `POST /api/clients` runs `create_client_with_vehicle` as the caller (src/pages/api/clients/index.ts:31).
  - Suppose the role check at `:21-23` regressed. The intruder row would then belong to client A, not mechanic A, so it would never show up in mechanic A's list. `toEqual(clientsBefore)` passes either way.
  - Only the 302 assertion and the entries check at `:101` actually guard the write path.
- **Fix A ⭐ Recommended**: After the POSTs, sign in as client A with `tests/db/clients.ts`, query `clients` by the intruder email (`rls-${runId}-intruder@…`), and assert `data` equals `[]`.
  - Strength: Proves directly that nothing was written, using the §6.2 anon-key pattern that is already in the repo.
  - Tradeoff: The HTTP suite now also depends on `tests/db/clients.ts`, and one more sign-in counts against the auth budget (18 of 30).
  - Confidence: MED — this assumes the RPC would let a client-role caller create a row. If the SQL function checks the role itself, the query also covers that layer.
  - Blind spot: I haven't checked whether `create_client_with_vehicle` enforces the mechanic role in SQL.
- **Fix B**: Drop the misleading `mechanicListIds` comparison and rely on the 302 and entries assertions.
  - Strength: No false confidence, and no extra auth call.
  - Tradeoff: The client-creation write path is then protected only by the redirect status.
  - Confidence: HIGH — the change is trivial.
  - Blind spot: None significant.
- **Decision**: PENDING

### F2 — 500 render re-runs the auth middleware

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:8
- **Detail**:
  - Astro renders `500.astro` through `handleMiddleware(errorState, …)` with `skipMiddleware = false` (node_modules/astro/dist/core/errors/default-handler.js:66-76).
  - Every render failure therefore repeats `getUser()` and the profile lookup.
  - In the narrow case where Supabase fails between the first pass and the error pass, the user gets redirected (`/auth/signin` or `/dashboard`) instead of seeing the 500 page.
  - In the normal case the 500 page renders, as confirmed by manual checks 1.6 and 3.6.
- **Fix**: At the top of `onRequest`, if `context.routePattern === "/500"`, skip the auth gates and `return bufferHtmlResponse(await next())`.
  - Strength: The error page no longer depends on the service that may be failing, and each failure costs one auth call fewer.
  - Tradeoff: Adds a special case to the only page gate; `500.astro` must stay free of data access.
  - Confidence: MED — I haven't checked whether `routePattern` is `/500` in the error state on Astro 7.3.2.
  - Blind spot: No test would cover the special case.
- **Decision**: PENDING

### F3 — No HTTP-level proof of the mid-render-throw 500 or the mechanic alert

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: N/A
- **Detail**:
  - A mid-render throw becoming a 500 is covered only by the unit tests (`src/lib/buffer-html.test.ts`) and manual checks 1.6 and 3.6.
  - The `loadError` alert (src/pages/dashboard/mechanic.astro:59-67) is covered only by manual check 2.7.
  - This follows from the plan's "no fault-injection route" rule. It is a known gap, not drift.
- **Fix**: No code change. Revisit only if a render regression gets past the unit-level controls.
- **Decision**: PENDING

### F4 — Assertion on redirect body can never fail

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/http/role-routing.test.ts:70
- **Detail**: `expect(body).not.toContain("data-client-id")` runs on a 302 body, which Astro always leaves empty. The status and location checks do the real work.
- **Fix**: Replace it with `expect(body).toBe("")`, or drop it.
- **Decision**: PENDING

### F5 — Mechanic alert wrapper differs from the reference markup

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/dashboard/mechanic.astro:60
- **Detail**:
  - The plan says to match ClientDashboardView.astro:55-65.
  - The `p`, the `a` and their classes match, but the wrapper is a plain `<div class="space-y-4">` instead of `Card`/`CardContent`, because it already sits inside a card-styled `<section>`.
  - The choice is sensible but undocumented.
- **Fix**: None needed. Mention it in the PR description if a reviewer asks.
- **Decision**: PENDING

### F6 — Oracle self-test runs only in the CI smoke job

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/http/page.test.ts
- **Detail**: `page.test.ts` needs no server, but it is picked up only by `vitest.http.config.ts`. It never runs in `npm test` or in job `ci`.
- **Fix**: Leave as is. The plan puts it next to its helper, and it still runs on every PR in job `smoke`.
- **Decision**: PENDING

### F7 — Local preview serves a stale build with the check-3.6 injected throw

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: dist/server/chunks/ServiceHistory_*.mjs:13
- **Detail**:
  - `dist/` was last written at 15:05 and still contains `throw new Error(".")` from the Phase 3 manual check.
  - The source is clean, and CI builds from clean source.
  - The preview on :4321 is serving that build, so local `test:http` fails 5 of 23, all of them on ServiceHistory pages.
  - A re-run of `npm run build` on Windows ended with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` and did not refresh `dist/`. The running preview may be holding the files.
- **Fix**: Stop the preview, `npm run build`, restart `npm run preview`, then re-run `npm run test:http`.
- **Decision**: FIXED — the stale preview was stopped. `npm run build` then exited 0: the libuv assertion was caused by the running preview holding `dist/`. The new preview (pid 12484) serves the clean build, and `npm run test:http` passes locally, 23 of 23.
