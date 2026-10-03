<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Structured error logging helper and middleware that fails loudly

- **Plan**: context/changes/middleware-error-logging/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-03
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 7 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — Auth 429 rate limit treated as sign-out

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/session-state.ts:21
- **Detail**: auth-js maps only NETWORK_ERROR_CODES (5xx) to AuthRetryableFetchError (`node_modules/@supabase/auth-js/dist/module/lib/fetch.js`); a JSON 429 (`over_request_rate_limit`) becomes `AuthApiError` with status 429, which the 400–499 branch classifies as anonymous. A signed-in user on /dashboard is then redirected to /auth/signin with no log line — the exact misleading redirect this change exists to remove. The same applies to a 401 caused by a misconfigured or rotated SUPABASE_KEY (every user looks signed out, nothing logged). Related: the test "is unavailable on a 5xx AuthApiError" (session-state.test.ts:39-40) uses status 500, which auth-js never produces as AuthApiError, so it does not exercise a real path.
- **Fix**: Exclude 429 from the anonymous branch (`status !== 429`) and add a 429 AuthApiError test case; optionally `logWarn` on other non-session 4xx codes.
- **Decision**: PENDING

### F2 — Log tests do not assert absence of email

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/log-error.test.ts:66-92
- **Detail**: Testing Strategy requires the logError/logWarn tests to assert parseable JSON "and no `email`". Neither test does (grep: no `email` in the file). Low runtime risk today — no caller passes email — but the PII guard the plan asked for is not pinned.
- **Fix**: Add `expect(parsed).not.toHaveProperty("email")` to both log tests.
- **Decision**: PENDING

### F3 — test:http not re-verified; build blocked by locked dist/

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: N/A
- **Detail**: Re-run during review: targeted vitest (24/24), `npm test` (82/82), `npm run lint`, `npx astro check` (0/0/0) all pass. `npm run build` failed with `EPERM ... dist\client` (file lock, likely a running preview); the same build to an alternate outDir succeeded. `npm run test:http` could not be run — local Supabase is not running. Progress marks 2.5 and manual 2.6–2.10 as done with c026be9; manual items have no diff evidence by nature and are taken on trust.
- **Fix**: Stop the running preview, `npx supabase start`, re-run `npm run build && npm run test:http` before merging.
- **Decision**: PENDING

### F4 — Error-page re-entry: extra Supabase calls, duplicate logs, 503 can replace 500

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:70-76
- **Detail**: After `render.failed` is rethrown, Astro renders 500.astro by re-running this middleware with the original pathname. On /dashboard/** that repeats getUser + profile select; if Supabase fails on that pass, the 503 is returned instead of the 500 and a second `supabase.unavailable` line is logged for the same request. The plan accepted Astro's own duplicate stack line but does not mention these duplicates — relevant before alert rules count log lines.
- **Fix A ⭐ Recommended**: Document the behaviour in the plan/change notes as a known limitation for future alerting work.
  - Strength: Zero code risk; behaviour is acceptable (user still gets an error page, both lines are correct).
  - Tradeoff: Alert rules built later must de-duplicate per request.
  - Confidence: HIGH — follows from Astro's default-handler flow cited in the plan.
  - Blind spot: Not reproduced at runtime in this review.
- **Fix B**: Skip Supabase lookups when `context.routePattern === "/500"`.
  - Strength: Removes extra round-trips and duplicate logs at the source.
  - Tradeoff: 500.astro then renders without user/profile locals; changes middleware behaviour beyond plan scope.
  - Confidence: MED — depends on how 500.astro and its layout use locals.
  - Blind spot: Haven't checked what routePattern Astro sets on the error-page pass.
- **Decision**: PENDING

### F5 — Context spread can overwrite level/event

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/log-error.ts:57,63
- **Detail**: `{ level, event, ...context, error }` lets a context key named `level` or `event` (allowed by the LogContext index signature) silently replace them.
- **Fix**: Spread context first: `{ ...context, level, event, error }`.
- **Decision**: PENDING

### F6 — NonError fallback can throw and mask the original error

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/log-error.ts:25-26
- **Detail**: `String(err)` throws for `Object.create(null)` or objects with a throwing toString. Inside the middleware catch (middleware.ts:74) that TypeError would replace the original render error. Unlikely in practice.
- **Fix**: Wrap `String(err)` in try/catch with an `"[unserializable]"` fallback.
- **Decision**: PENDING

### F7 — Unbounded message/details in log lines

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/log-error.ts:33-38
- **Detail**: `message` and `details` are logged verbatim. A non-JSON PostgREST error body (e.g. a Cloudflare 5xx HTML page) becomes a multi-KB message; and `render.failed` serializes any thrown error, so a future Postgres constraint error could log values like `Key (email)=(...)`. No such throw exists in src/pages today.
- **Fix**: Truncate `message` and `details` to ~1 KB in serializeAt.
  - Strength: Bounds line size for Cloudflare logs; one place, covered by existing tests.
  - Tradeoff: Long legitimate messages lose their tail; does not address PII in short details.
  - Confidence: MED — size issue is concrete, PII risk is prospective.
  - Blind spot: Cloudflare Workers log line limits not checked.
- **Decision**: PENDING

### F8 — Unplanned service-unavailable.test.ts

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/service-unavailable.test.ts
- **Detail**: Not listed in the plan's Changes Required. Small, pins the 503 contract, harmless.
- **Fix**: Note it in the plan's Phase 2 Changes Required as an addendum.
- **Decision**: PENDING

### F9 — Cloudflare invocation logs may record full URLs

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: wrangler.jsonc:12-14
- **Detail**: `observability.enabled: true` turns on Workers Logs, whose invocation logs record request metadata, possibly including the full URL with `/share/<token>` and `?error=`. That would bypass `safePath` at the platform level. Outside this change's diff (plan excludes wrangler.jsonc changes); based on documented platform behaviour, not verified against a live log entry.
- **Fix**: Check a Workers Logs entry in the Cloudflare dashboard; if the URL is present, open a follow-up change to set `observability.logs.invocation_logs: false` (keeping console logs) or document the exposure.
  - Strength: Confirms or closes the only remaining token-leak path found.
  - Tradeoff: Disabling invocation logs loses per-request metadata useful for debugging.
  - Confidence: MED — platform behaviour not verified here.
  - Blind spot: Current Workers Logs field set not checked.
- **Decision**: PENDING
