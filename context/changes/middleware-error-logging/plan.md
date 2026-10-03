# Structured error logging helper and middleware that fails loudly — Implementation Plan

## Overview

Introduce one shared helper that writes structured, single-line JSON error logs, and use it in `src/middleware.ts` so that Supabase outages stop looking like ordinary logouts or wrong-role views. On protected routes a Supabase failure returns a 503; on public routes it is logged and the request continues anonymously; render-time exceptions are logged with request context before Astro's 500 page takes over. Closes findings D1, D2 and D13 of `context/audits/observability/2026-10-03_dashboard-entries.md` (fix order steps 1–2).

## Current State Analysis

- `src/middleware.ts:17-19` destructures only `data` from `supabase.auth.getUser()`. auth-js never throws here; it returns `{ user: null, error }` for a missing session (`AuthSessionMissingError`, `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:2707`), for a rejected token (`AuthApiError` 4xx) and for an outage (`AuthRetryableFetchError` / 5xx). All three become "anonymous" → 302 to `/auth/signin` on `/dashboard/**` (l.29-31), with no log.
- `src/middleware.ts:24-25` ignores the profile query `error`; a failure becomes `profile = null`, which the fail-closed gate (l.40-41) turns into a redirect to `/dashboard`, where a mechanic sees the client empty state. No log.
- `src/middleware.ts:45` buffers HTML (`src/lib/buffer-html.ts`) so a mid-render throw becomes a 500. The only record is Astro's own `console.error` of `err.stack` (`node_modules/astro/dist/core/routing/handler.js:101-102`): no route, user, cause or error code.
- `src/pages/500.astro` is rendered by Astro after re-running the middleware (`astro/dist/core/errors/default-handler.js:66-90`); if the error page fails, Astro swallows it and returns an empty 500.
- There is zero application logging in `src/` (no `console.*`); ESLint enforces `no-console: "warn"` for `src/` (`eslint.config.js:25`).
- Unit tests run from `src/**/*.test.ts` in Node (`vitest.config.ts`); they cannot import `astro:middleware` / `astro:env`, so testable logic must live in plain modules under `src/lib/`. HTTP integration tests (`tests/http/role-routing.test.ts`) pin today's role redirects and must stay green.
- `context/foundation/lessons.md` does not exist; no prior team rules apply.

## Desired End State

- A Supabase Auth or profile-lookup outage on `/dashboard/**` returns **503** with a small static "temporarily unavailable" page and writes one structured `error` log line naming the stage (`auth.getUser` / `profiles.select`), route and error details.
- The same outage on any other route (`/`, `/auth/*`, `/share/*`, `/api/*`) writes the same log line and the request continues as anonymous.
- A missing session or a rejected/expired token is still plain "anonymous": same redirects as today, no log line.
- A logged-in user with no `profiles` row still gets today's fail-closed redirect, plus one `warn` log line flagging a data-integrity problem with the user id.
- An exception thrown while rendering any page produces one structured `error` log line (route, method, user id, error name/message/stack/cause chain) and then still reaches Astro's 500 page.
- Verify by: unit tests for the helpers, the existing HTTP role-routing suite, and a manual preview run with local Supabase stopped.

### Key Discoveries:

- auth-js exports `isAuthSessionMissingError`, `isAuthApiError`, `isAuthRetryableFetchError` (`node_modules/@supabase/auth-js/dist/module/lib/errors.js`); these are the classification primitives.
- Astro exposes `context.routePattern` (`node_modules/astro/dist/types/public/context.d.ts:583`), e.g. `/share/[token]`, which is safe to log where the raw path is not.
- The error page re-runs middleware (`default-handler.js:66,76`), so the 503 path must not depend on Supabase and must not throw.
- Test plan risk #1 (`context/foundation/test-plan.md`) covers "logged-in user gets a blank/misleading page with no error, no alert"; this change is its observability counterpart.

## What We're NOT Doing

- No changes to dashboard pages, API routes, share-link or auth endpoints (audit fix-order steps 3–4: D3–D12, P1–P5). `/api/*` only gets the middleware-level log on an Auth outage.
- No error tracker SDK (Sentry etc.), no Cloudflare alert rules, no Logpush; this change only makes the logs worth alerting on.
- No release/version tagging (P6) and no `wrangler.jsonc` changes.
- No redesign of `500.astro`, and no change to the fail-closed role gate semantics.
- No client-side (browser) error capture.
- No de-duplication of Astro's own unstructured stack line; the structured line is added next to it.

## Implementation Approach

Keep all decisions in two plain, unit-tested modules under `src/lib/`. The first serializes errors and writes JSON log lines. The second classifies Supabase results into "anonymous / signed in / unavailable" and "profile found / missing / unavailable". `src/middleware.ts` then only wires these together, so its behaviour change is small and readable, and the existing HTTP suite guards the unchanged paths.

## Critical Implementation Details

- **Secrets in paths.** `/share/<token>` paths carry a bearer token, and query strings can carry raw DB messages (`?error=`). Log `context.routePattern` plus a pathname in which the `[token]` segment is masked; never log the query string, email, cookies or form data.
- **Error page re-entry.** Astro renders `500.astro` through the middleware again. The render `try/catch` must rethrow (not return its own 500) so Astro still renders the page, and the 503 response must be a static string built without Supabase or Astro components so it cannot fail.
- **Auth classification.** Only `isAuthSessionMissingError` and `isAuthApiError` with a 4xx `status` count as anonymous. Everything else (retryable fetch errors, 5xx, unknown errors) counts as unavailable. Getting this wrong either floods logs on every anonymous visit or hides outages again.

## Phase 1: Error logging helper and Supabase result classification

### Overview

Add the two pure modules with unit tests. No runtime behaviour changes yet.

### Changes Required:

#### 1. Structured error log helper

**File**: `src/lib/log-error.ts` (+ `src/lib/log-error.test.ts`)

**Intent**: One place that turns any thrown or returned error into a JSON-serializable shape and writes a single-line JSON log, so later fixes (pages, API routes, a future tracker) reuse it instead of ad-hoc `console` calls.

**Contract**:
- `serializeError(err: unknown)` → `{ name, message, code?, status?, details?, hint?, stack?, cause? }`. `cause` is serialized recursively with a depth cap of 3. Non-`Error` values (strings, PostgREST-style plain objects with `message`/`code`/`details`/`hint`) keep their fields; unknown values become `{ name: "NonError", message: String(value) }`.
- `logError(event: string, err: unknown, context?: LogContext)` and `logWarn(event: string, context?: LogContext, err?: unknown)` write `console.error` / `console.warn` with `JSON.stringify({ level, event, ...context, error })`.
- `LogContext` = `{ route?: string; path?: string; method?: string; userId?: string; stage?: string; [key: string]: string | number | undefined }`.
- `safePath(pathname: string)` masks the token segment of `/share/<token>` (e.g. `/share/***`) and leaves other paths unchanged.
- This file is the only place in `src/` that calls `console`; disable `no-console` for those two calls with a one-line justification comment.

#### 2. Supabase result classification

**File**: `src/lib/session-state.ts` (+ `src/lib/session-state.test.ts`)

**Intent**: Separate "no data" from "failed" for the two middleware lookups, so the middleware can treat each correctly and the rule is unit-tested without Astro.

**Contract**:
- `classifyAuth({ user, error })` → `{ kind: "signed-in", user } | { kind: "anonymous" } | { kind: "unavailable", error }`. Anonymous when `error` is null and `user` is null, when `isAuthSessionMissingError(error)`, or when `isAuthApiError(error)` with `status` in 400–499; everything else with an error is `unavailable`.
- `classifyProfile({ data, error })` → `{ kind: "found", role } | { kind: "missing" } | { kind: "unavailable", error }`. A PostgREST `.single()` "no rows" result (`code: "PGRST116"`) is `missing`, not `unavailable`.

### Success Criteria:

#### Automated Verification:

- Unit tests for `log-error` pass: `npx vitest run src/lib/log-error.test.ts`, covering Error with cause chain, PostgREST-like object, non-Error value, depth cap, and `/share/<token>` masking
- Unit tests for `session-state` pass: `npx vitest run src/lib/session-state.test.ts`, covering missing session, 401/403 AuthApiError, AuthRetryableFetchError, 5xx AuthApiError, unknown error, PGRST116, other PostgREST error, found role
- Full unit suite passes: `npm test`
- Lint passes with no new warnings: `npm run lint`
- Type check passes: `npx astro check`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase. Phase blocks use plain bullets — the corresponding checkboxes live in the `## Progress` section.

---

## Phase 2: Middleware returns 503, logs failures and render exceptions

### Overview

Wire the helpers into `src/middleware.ts`, add the static 503 response, and verify both unchanged and new behaviour.

### Changes Required:

#### 1. Static 503 response

**File**: `src/lib/service-unavailable.ts`

**Intent**: A response the middleware can return during a Supabase outage that cannot itself fail or depend on Supabase.

**Contract**: `serviceUnavailableResponse(): Response` with status 503, `content-type: text/html; charset=utf-8`, `cache-control: no-store`, `retry-after: 30`, and a minimal self-contained HTML body (inline styles only, no layout, no external assets) with a short message and a link to `/`.

#### 2. Middleware wiring

**File**: `src/middleware.ts`

**Intent**: Use the classifications so outages are logged and, on protected routes, answered with 503 instead of misleading redirects; log render exceptions with context.

**Contract**:
- Build a log context once per request: `route: context.routePattern`, `path: safePath(pathname)`, `method`, and `userId` once known.
- `classifyAuth` → `unavailable`: `logError("supabase.unavailable", error, { ...ctx, stage: "auth.getUser" })`; return `serviceUnavailableResponse()` when `isProtected`, otherwise continue with `user = null`.
- Profile lookup (protected routes only, as today) → `unavailable`: log with `stage: "profiles.select"` and return the 503. → `missing`: `logWarn("profile.missing", { ...ctx, userId })` and keep `profile = null` (existing fail-closed redirects unchanged).
- Wrap `bufferHtmlResponse(await next())` in `try/catch`: on error `logError("render.failed", err, ctx)` and rethrow.
- Redirect targets, protected-route list and role gates stay exactly as today.

### Success Criteria:

#### Automated Verification:

- Full unit suite passes: `npm test`
- Lint passes with no new warnings: `npm run lint`
- Type check passes: `npx astro check`
- Build succeeds: `npm run build`
- HTTP role-routing and dashboard suites stay green against preview + local Supabase: `npm run test:http`

#### Manual Verification:

- With local Supabase running, signed-in mechanic and client dashboards render as before and the preview console shows no new log lines
- With local Supabase stopped (`npx supabase stop`) and the preview still running with a previous session cookie, `GET /dashboard` returns 503 with the static page, and the preview console shows one JSON line with `"event":"supabase.unavailable"` and `"stage":"auth.getUser"`
- With local Supabase stopped, `GET /` renders the anonymous home page (200) and logs the same event
- Visiting `/share/<token>` with Supabase stopped logs a `path` with the token masked
- A temporary `throw new Error("probe")` in a dashboard component (reverted afterwards) produces one `"event":"render.failed"` JSON line with route and userId, and the 500 page is still shown

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `serializeError`: Error with nested `cause` (3+ levels, capped), `PostgrestError`-like plain object, string, `null`, object without `message`.
- `safePath`: `/share/abc123` masked, `/share/abc123/` masked, `/dashboard/mechanic/clients/<uuid>` unchanged.
- `logError` / `logWarn`: spy on `console.error` / `console.warn`, assert one call with parseable JSON containing `level`, `event`, context fields and no `email`.
- `classifyAuth` / `classifyProfile`: one case per branch listed in Phase 1, using real error classes from `@supabase/auth-js` where exported.

### Integration Tests:

- Existing `npm run test:http` suite (role routing, dashboard render) must pass unchanged; it proves the anonymous and role-redirect paths did not regress.

### Manual Testing Steps:

1. `npm run build && npm run preview` with `npx supabase start`; sign in as mechanic and as client; dashboards unchanged, no new logs.
2. Keep the browser session, run `npx supabase stop`; reload `/dashboard` → 503 page, one JSON `supabase.unavailable` line.
3. Open `/` → anonymous home page, one JSON log line.
4. Open `/share/<any-token>` → log line with masked path.
5. Add a temporary throw in `src/components/ServiceHistory.astro`, rebuild, open a dashboard → 500 page plus one `render.failed` line; revert the throw.

## Performance Considerations

None material: classification is in-memory, and logging only happens on failures and missing profiles.

## Migration Notes

None. No schema or config changes; deploy is a normal code release.

## References

- Audit report: `context/audits/observability/2026-10-03_dashboard-entries.md` (findings D1, D2, D13; fix order steps 1–2)
- Test plan risk #1: `context/foundation/test-plan.md`
- Incident: commit `f763bdb` (blank dashboards)
- Middleware: `src/middleware.ts:8-46`
- Astro error path: `node_modules/astro/dist/core/routing/handler.js:101-108`, `node_modules/astro/dist/core/errors/default-handler.js:64-90`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Error logging helper and Supabase result classification

#### Automated

- [x] 1.1 Unit tests for log-error pass — 5dc1bc6
- [x] 1.2 Unit tests for session-state pass — 5dc1bc6
- [x] 1.3 Full unit suite passes — 5dc1bc6
- [x] 1.4 Lint passes with no new warnings — 5dc1bc6
- [x] 1.5 Type check passes — 5dc1bc6

### Phase 2: Middleware returns 503, logs failures and render exceptions

#### Automated

- [x] 2.1 Full unit suite passes
- [x] 2.2 Lint passes with no new warnings
- [x] 2.3 Type check passes
- [x] 2.4 Build succeeds
- [x] 2.5 HTTP role-routing and dashboard suites stay green

#### Manual

- [x] 2.6 Dashboards unchanged with Supabase running, no new logs
- [x] 2.7 Protected route returns 503 and logs auth.getUser outage
- [x] 2.8 Public home page renders anonymously and logs outage
- [x] 2.9 Share path is masked in the log
- [x] 2.10 Render exception logs render.failed and shows 500 page
