<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Client dashboard UI audit

- **Plan**: context/changes/client-dashboard-ui-audit/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-09-26
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Notes:
- All planned changes match the plan's intent (drift pass over `52e0f4f^..HEAD`). The four-branch precedence, `role="alert"` and the "Try again" link are in place. Date formatting is UTC-safe. The tests are NBSP-aware and assert the ungrouped 4-digit case. `nextService` reads only the newest entry. The contrast ratios in `tokens.md` were recomputed independently and match. `before/` was only ever written by 52e0f4f.
- No "What We're NOT Doing" boundary was crossed, and no dependency was added.
- The `/dev/dashboard-states` guard holds in every build: `import.meta.env.DEV` is replaced with `false`, and the preview check returned 404.
- No XSS surface: there is no `set:html`, and the lint rule enforces that.
- Automated criteria re-run at HEAD: 34 tests, lint and the grep checks pass. Build and preview-404 passed at 2eab598, and `src/` is unchanged since. Every manual item was confirmed by the user.
- Findings F1–F5 of `impl-review-phase-1.md` were re-checked and are all still present. F1 and F3 below carry them forward; this report supersedes the phase-1 report.

## Findings

### F1 — Screenshot script can capture an error page or hang

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/screenshot-states.mjs:34, :66-68, :82-86, :124-131
- **Detail**: This combines phase-1 F1, F2 and F4, which were never triaged.
  - The script ignores `Page.navigate`'s `errorText` and the HTTP status. Against a non-dev server it silently saves a screenshot of the 404 page. The Phase 4 `after/` shots are valid, because their content was checked with curl beforehand. The script itself does not guarantee this.
  - A bad `EDGE_PATH` raises an unhandled spawn `error`.
  - `cdp.send` and `cdp.once` have no timeout and are not rejected when the WebSocket closes, so the script hangs if Edge dies.
  - `cdp.close()` sits outside `finally`, and `rm` in `finally` can replace the original error.
- **Fix**: Run a `fetch(url)` 200 pre-check that names `npm run dev` in its error, and throw on `errorText`. Add an `edge.once("error")` rejection, a ~30s timeout on send/once, and reject pending calls on ws close. Wrap the `finally` cleanup in try/catch and warn.
- **Decision**: PENDING

### F2 — Query error is swallowed: no log, same advice for permanent failures

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:21-31
- **Detail**: The Supabase error is reduced to `Boolean(error)` and discarded, so Workers logs show nothing when a client sees "couldn't be loaded". Some failures are permanent, and "Try again" can never fix them:
  - an RLS or embed error;
  - PGRST116, which `maybeSingle` returns when a `user_id` matches more than one row. `clients.user_id` has no unique constraint, but linking goes through the unique `clients_email_key`, so this is unlikely.
- **Fix A ⭐ Recommended**: `console.error("dashboard: clients query failed", error.code, error.message)` before reducing to the boolean
  - Strength: A one-line, server-only change that leaks nothing to HTML and makes the error state diagnosable in `wrangler tail` / Workers logs.
  - Tradeoff: It would be the first logging call in `src/`, so it sets a precedent without a convention.
  - Confidence: HIGH — Workers captures `console.error` by default.
  - Blind spot: The log format and PII policy haven't been decided. The message is PostgREST text, not user data.
- **Fix B**: Log as in A, and also add a follow-up migration with a unique index `clients(user_id) where user_id is not null`
  - Strength: Rules out the duplicate-row case at the database.
  - Tradeoff: A schema change inside a UI change. The plan's NOT-doing list excludes data-model changes, so this belongs in a separate change.
  - Confidence: MED — no existing duplicates were checked for.
  - Blind spot: Existing data may already violate the index.
- **Decision**: PENDING

### F3 — Tie-break fixture doesn't exercise the tie-break

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/dev/dashboard-states.astro:18-55
- **Detail**: This is phase-1 F3, still present. e-1 (created 10:00) is already ahead of e-3 (08:00) in the array. A stable sort on `service_date` alone produces the same order, so the kitchen sink can't show a tie-break regression, and label (a) claims more than the fixture proves. The unit test `service-history.test.ts:26-34` does cover the tie-break, so the gap is only in the visual gate.
- **Fix**: Put e-3 before e-1 in the fixture array.
- **Decision**: PENDING

### F4 — `card.tsx` hand-edited despite the plan's "no hand edits"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/ui/card.tsx:2
- **Detail**: shadcn CLI 4.21.0 generated `import { cn } from "cn"` and added the `cn` npm package. The implementer dropped the dependency and pointed the import at `@/lib/utils`, which matches `button.tsx`. The change is disclosed with its reason in `tokens.md:17`, and the rest of the file is stock new-york v4. It is justified, but it goes against the plan's literal contract.
- **Fix**: Accept it as a documented deviation. `tokens.md` already records it; no code change.
- **Decision**: PENDING

### F5 — ESLint rule disabled for the whole file to dodge a crash

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dev/dashboard-states.astro:7-8
- **Detail**: This is phase-1 F5. `@typescript-eslint/no-misused-promises` crashes on a top-level frontmatter `return new Response(...)`, and the file disables the rule entirely. The next dev-only guarded page will hit the same crash.
- **Fix**: Record it as a lesson, or scope an override to `src/pages/dev/**` in `eslint.config`.
- **Decision**: PENDING

### F6 — Mechanic dashboard now visibly diverges from the client view

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dashboard/mechanic.astro:39-50
- **Detail**: The mechanic view still has a hand-rolled sign-out button, `rounded-2xl` sections and `text-foreground` for "Signed in as". The client view now uses `buttonVariants`, `Card` and `text-muted-foreground`. The plan defers this (`charges.md` → Deferred), so this is expected, but the drift is now visible.
- **Fix**: Open a follow-up change that applies the same contract to the mechanic dashboard.
- **Decision**: PENDING

### F7 — Stale "full-plan review still to run" line in charges.md

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/client-dashboard-ui-audit/charges.md:68
- **Detail**: The checklist walk-through says the full-plan `/10x-impl-review` is "still to run". It has now run (this report).
- **Fix**: Point the line at `reviews/impl-review.md` and mark the item done once triage finishes.
- **Decision**: PENDING
