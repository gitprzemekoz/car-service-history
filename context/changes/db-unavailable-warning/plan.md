# Database-unavailable warning on the main page — Implementation Plan

## Overview

Show a small warning in the bottom-right corner of the main page (`/`) when Supabase's database cannot be reached. The page checks database health once after load via a new `GET /api/health` endpoint.

## Current State Analysis

- `src/pages/index.astro` renders only `Welcome.astro` inside `Layout.astro`; it makes no Supabase call.
- `src/middleware.ts:27` detects outages only through `auth.getUser()`. For an anonymous visitor (no session cookie) supabase-js returns "session missing" without a network call, so a DB outage is invisible on `/` for exactly the visitors who see the landing page.
- `Layout.astro` already renders an error `Banner` when Supabase is *not configured* (`src/lib/config-status.ts`). That case stays covered by the banner; this change only handles "configured but unreachable".
- No health endpoint exists today.

## Desired End State

- `GET /api/health` returns JSON `{ "database": "ok" | "unavailable" | "unconfigured" }` with `cache-control: no-store`; status `200` for `ok`/`unconfigured`, `503` for `unavailable`.
- On `/`, after load, a script calls `/api/health` once. When the response is `503` / `database: "unavailable"`, a small fixed warning (`data-testid="db-unavailable-warning"`, `role="status"`) appears at the bottom-right. Otherwise nothing is shown.
- Verified by Vitest unit tests (classifier), an HTTP integration test (real endpoint → `ok`), and a Playwright spec that mocks `/api/health`.

### Key Discoveries:

- PostgREST answers `503` when it cannot reach Postgres; postgrest-js reports `status: 0` when `fetch` itself fails or is aborted. A 4xx (e.g. RLS/permission) means the DB *is* reachable.
- Anonymous `profiles` select is RLS-filtered to zero rows without error (`supabase/migrations/20260922120000_roles_and_domain_schema.sql:20`) — a cheap probe.
- Outage logging convention: `logError("supabase.unavailable", err, { ...ctx, stage })` — `src/middleware.ts:28`.
- Warning palette already used by `src/components/Banner.astro` (`.banner--warning`).
- API route pattern: `src/pages/api/share-link/revoke.ts`; unit tests live next to code (`src/lib/*.test.ts`); e2e in `tests/e2e/*.spec.ts`; HTTP tests in `tests/http/*.test.ts`.

## What We're NOT Doing

- No polling / live recovery — one check per page load (refresh to re-check).
- No warning on pages other than `/`.
- No change to the "not configured" banner or to middleware outage handling.
- No server-side (SSR) probe on `/` — the page render never waits on the DB.

## Implementation Approach

Pure classifier + thin probe in `src/lib/db-health.ts` (unit-testable without Supabase), exposed through `src/pages/api/health.ts`. The UI is a static, hidden Astro component with an inline module script that un-hides it on an `unavailable` response, so the main page stays fully static and fast.

## Critical Implementation Details

- **Timing & lifecycle** — the probe must use a bounded timeout (`AbortSignal.timeout(3000)` via postgrest's `.abortSignal()`), otherwise a hanging DB holds the health request open. An aborted request surfaces as `status: 0` and therefore classifies as `unavailable`.
- **User experience spec** — a failed fetch of `/api/health` itself (app unreachable, network error) must NOT show the DB warning; only an explicit `unavailable` answer does.

## Phase 1: Health check endpoint

### Overview

Add the DB health classifier/probe and expose it at `GET /api/health`.

### Changes Required:

#### 1. Health library

**File**: `src/lib/db-health.ts`

**Intent**: Decide whether the database is reachable from a PostgREST response status, and run a cheap, time-bounded probe query.

**Contract**: `export type DbHealth = "ok" | "unavailable" | "unconfigured"`; `export function classifyDbStatus(status: number): "ok" | "unavailable"` — `status === 0 || status >= 500` → `"unavailable"`, else `"ok"`; `export async function checkDbHealth(supabase: SupabaseClient | null): Promise<{ health: DbHealth; error?: unknown }>` — `null` client → `"unconfigured"`; otherwise `profiles.select("id", { head: true }).limit(1).abortSignal(AbortSignal.timeout(3000))`, classified by `status`; a thrown error also → `"unavailable"`.

#### 2. Unit tests

**File**: `src/lib/db-health.test.ts`

**Intent**: Pin the classification boundaries and the probe's handling of null client, error statuses and thrown errors (with a stub client).

**Contract**: cases for `0`, `200`, `206`, `401`, `404`, `500`, `503`; `checkDbHealth(null)` → `unconfigured`; stub returning `{status: 503}` → `unavailable`; stub throwing → `unavailable`.

#### 3. API route

**File**: `src/pages/api/health.ts`

**Intent**: Expose the probe to the browser; log real outages.

**Contract**: `GET` → JSON `{ database: DbHealth }`, `cache-control: no-store`; `200` for `ok`/`unconfigured`, `503` for `unavailable` (and `logError("supabase.unavailable", error, { route, path, method, stage: "health" })`).

#### 4. HTTP integration test

**File**: `tests/http/health.test.ts`

**Intent**: Prove the real endpoint answers `ok` against local Supabase.

**Contract**: `GET /api/health` → `200`, `{ database: "ok" }`, `cache-control: no-store`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Build passes: `npm run build`
- HTTP test passes against preview + local Supabase: `npm run test:http -- tests/http/health.test.ts`

#### Manual Verification:

- With local Supabase stopped, `curl -i http://localhost:4321/api/health` returns `503` and `{"database":"unavailable"}`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 2: Main-page warning

### Overview

Render a small bottom-right warning on `/` when `/api/health` reports the database as unavailable, and cover it with Playwright.

### Changes Required:

#### 1. Warning component

**File**: `src/components/DbStatusWarning.astro`

**Intent**: Hidden-by-default fixed box at bottom-right using the existing warning palette; an inline script fetches `/api/health` once and un-hides it only on `503` / `database: "unavailable"`.

**Contract**: root element `data-testid="db-unavailable-warning"`, `role="status"`, `hidden` initially; text "Database is unavailable — some features may not work right now."; positioned `fixed bottom-4 right-4`, small (`text-sm`, `max-w-xs`), above page content (`z-50`). Fetch errors are swallowed (warning stays hidden).

#### 2. Main page

**File**: `src/pages/index.astro`

**Intent**: Mount the warning on the main page only.

**Contract**: `<DbStatusWarning />` added inside `<Layout>` after `<Welcome />`.

#### 3. E2E spec

**File**: `tests/e2e/db-unavailable-warning.spec.ts`

**Intent**: Prove the warning renders in a real browser for an outage and stays hidden when healthy, independent of the real DB state.

**Contract**: anonymous storage state; `page.route("**/api/health", …)` fulfilling `503 {database:"unavailable"}` → warning visible with its text; fulfilling `200 {database:"ok"}` → after the health response, warning hidden.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Build passes: `npm run build`
- E2E spec passes: `npx playwright test tests/e2e/db-unavailable-warning.spec.ts`

#### Manual Verification:

- With local Supabase stopped, opening `/` shows the small warning at the bottom-right; with it running, no warning

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation.

---

## Testing Strategy

### Unit Tests:

- `classifyDbStatus` boundaries (0, 2xx, 4xx, 5xx)
- `checkDbHealth` with null client, 5xx stub, throwing stub

### Integration Tests:

- HTTP: real `/api/health` → `ok`
- E2E: mocked `/api/health` 503 → visible; 200 → hidden

### Manual Testing Steps:

1. `npx supabase stop`, `npm run build && npm run preview`, open `/` → warning bottom-right.
2. `npx supabase start`, reload `/` → no warning.

## Performance Considerations

One extra lightweight request per main-page load, made after render; the probe is a `HEAD`-style count-free select capped at 3 s.

## References

- Outage handling pattern: `src/middleware.ts:27`
- Warning palette: `src/components/Banner.astro`
- API route pattern: `src/pages/api/share-link/revoke.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Health check endpoint

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — f98e6b9
- [x] 1.2 Lint passes: `npm run lint` — f98e6b9
- [x] 1.3 Build passes: `npm run build` — f98e6b9
- [x] 1.4 HTTP test passes against preview + local Supabase: `npm run test:http -- tests/http/health.test.ts` — f98e6b9

#### Manual

- [x] 1.5 With local Supabase stopped, `curl -i http://localhost:4321/api/health` returns `503` and `{"database":"unavailable"}` — f98e6b9

### Phase 2: Main-page warning

#### Automated

- [x] 2.1 Unit tests pass: `npm test` — 1f25bea
- [x] 2.2 Lint passes: `npm run lint` — 1f25bea
- [x] 2.3 Build passes: `npm run build` — 1f25bea
- [x] 2.4 E2E spec passes: `npx playwright test tests/e2e/db-unavailable-warning.spec.ts` — 1f25bea

#### Manual

- [x] 2.5 With local Supabase stopped, opening `/` shows the small warning at the bottom-right; with it running, no warning — 1f25bea
