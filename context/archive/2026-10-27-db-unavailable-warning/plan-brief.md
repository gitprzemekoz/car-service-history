# Database-unavailable warning — Plan Brief

> Full plan: `context/changes/db-unavailable-warning/plan.md`

## What & Why

Visitors to the main page get no signal when Supabase's database is down; they only discover it when sign-in or the dashboard fails. A small bottom-right warning on `/` tells them up front.

## Starting Point

`/` is a static landing page with no DB call. The middleware only notices outages through `auth.getUser()`, which makes no network call for anonymous visitors, so the landing page never learns about an outage. A "Supabase not configured" banner already exists in `Layout.astro`.

## Desired End State

`GET /api/health` reports `ok` / `unavailable` (503) / `unconfigured`. The main page checks it once after load and, on `unavailable`, shows a small fixed warning in the bottom-right corner.

## Key Decisions Made

| Decision  | Choice                                   | Why (1 sentence)                                                         |
| --------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| Detection | Client fetch of new `/api/health`        | Page render never waits on a slow/dead DB; endpoint is easy to mock.      |
| Signal    | PostgREST status `0` or `>=500` = down   | 503 is PostgREST's "no DB" answer; 0 is fetch failure/timeout; 4xx = DB up. |
| Recovery  | Check once per page load                 | Simplest; no background traffic.                                         |
| Tests     | Vitest unit + HTTP test + Playwright e2e | Covers logic, real endpoint, and the browser render.                     |
| Unconfigured | No warning (existing banner covers it) | Avoids two messages for one problem.                                    |

## Scope

**In scope:** `src/lib/db-health.ts`, `src/pages/api/health.ts`, `src/components/DbStatusWarning.astro`, `index.astro` wiring, tests.

**Out of scope:** polling, warnings on other pages, SSR probe, middleware changes.

## Architecture / Approach

Browser loads `/` → inline script `fetch("/api/health")` → route calls `checkDbHealth()` (3 s-bounded `profiles` head select) → `503 {database:"unavailable"}` → script un-hides the warning.

## Phases at a Glance

| Phase                     | What it delivers                         | Key risk                                   |
| ------------------------- | ---------------------------------------- | ------------------------------------------ |
| 1. Health check endpoint  | `/api/health` + unit/HTTP tests          | Misclassifying 4xx as outage               |
| 2. Main-page warning      | Bottom-right warning on `/` + e2e spec   | Warning shown on app/network fetch failure |

**Prerequisites:** local Supabase for HTTP test; build+preview for e2e.
**Estimated effort:** ~1 session, 2 phases.

## Open Risks & Assumptions

- Assumes `anon` can `select` on `profiles` (RLS-filtered). If not, PostgREST returns 4xx → still classified `ok` (DB reachable), which is correct.

## Success Criteria (Summary)

- With the DB down, `/` shows a small bottom-right warning; with it up, nothing extra appears.
- All unit, HTTP and e2e tests pass in CI.
