# Dashboard data-render protection (test-plan Phase 2) — Plan Brief

> Full plan: `context/changes/testing-dashboard-data-render/plan.md`
> Research: `context/changes/testing-dashboard-data-render/research.md`

## What & Why

This plan protects against test-plan risks #1 and #6. Risk #1: a signed-in client or mechanic gets a blank HTTP 200
although their data exists. That already happened once (commit f763bdb). Risk #6: a client reaches mechanic
pages or API. The plan makes render failures visible to users, and proves in CI that seeded data actually renders
for each role and that role routing holds.

## Starting Point

- **Why a failure is silent today.** Astro 7 on the Cloudflare adapter streams every page. A throw in a child
  component after the 200 has been sent yields a truncated body, and gzip clients get an empty one. Nothing
  errors.
- **Mechanic list.** `/dashboard/mechanic` turns a failed query into "No clients yet."
- **Role gate.** Page role checks live only in `src/middleware.ts`.
- **Existing tests don't catch this.** Smoke checks status codes only. Phase 1 left anon-key fixtures in
  `tests/db/` that this plan reuses.

## Desired End State

- A render error on any HTML page reaches the user as a 500 with a visible alert page, and the error is logged.
- The mechanic list shows an alert when its query fails.
- `npm run test:http` runs in the CI `smoke` job against the built preview. It proves:
  - each role sees exactly its own seeded entry and client ids, on a complete page;
  - the other pair's data is absent;
  - a client is redirected away from mechanic pages and API writes, with no state change;
  - no redirect loops exist.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Blank-200 mechanism | Mid-stream throw after headers are sent, so status can't change | Verified in Astro source and a workerd probe | Research |
| Make failures loud | Middleware buffers HTML; render error becomes a 500 plus `500.astro` | Fulfils "visible error, not an empty 200" at one central point, and the mechanism is verified | Plan |
| Harness | Vitest suite `tests/http/**`, `npm run test:http` | Reuses Phase 1 fixtures for fresh seeded data; readable body assertions | Plan |
| Negative control | Unit tests on synthetic mid-stream-failing bodies (middleware helper plus oracle) | DB column types prevent seeding a formatter-breaking row; no test-only code ships | Plan |
| Selectors | A few `data-testid` markers (`page-end`, `service-entry` + id, `client-row` + id) | Resilient to copy/theme/pl-PL formatting changes | Plan |
| Mechanic swallowed error | `loadError` alert on `/dashboard/mechanic`; detail/edit keep 404 | Closes the second silent-empty class on the page mechanics use most | Plan |
| Role enforcement surface | Middleware for pages, per-route checks for mechanic POST APIs | No GET API exists; RLS is already covered by Phase 1 | Research |

## Scope

**In scope:**
- HTML buffering in middleware, a visible 500 page and its unit tests.
- `data-testid` markers and the mechanic-list alert.
- HTTP suite: data render for client and mechanic, foreign-data absence, role routing, loop cap, client API
  write denial, and an oracle self-test.
- CI step and test-plan updates (§3, §4, §5, §6.3, §6.6).

**Out of scope:**
- Detail/edit error handling (stays 404).
- A fault-injection route and a `streaming=false` fetch handler.
- Browser e2e, snapshots and visual regression.
- Changes to `smoke.mjs`.
- Share-link rendering and write-path IDOR (Phase 3).
- The migration gate (Phase 4).

## Architecture / Approach

The request goes through the middleware (auth/role redirects, then `next()`), then to `bufferHtmlResponse`. For an
HTML response, the helper reads the full body. A stream error rejects, and Astro's middleware fallback renders
`500.astro` with a 500 status. The HTTP suite seeds pairs through `tests/db/fixtures.ts` (anon key), signs in via
`/api/auth/signin` with a cookie jar, then asserts `assertCompletePage` (`</html>` plus `page-end`) and the exact
seeded ids via `data-*` attributes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Visible render failure | `bufferHtmlResponse` plus middleware wiring, `500.astro`, unit negative control | Dropping headers/cookies when rebuilding the Response (mitigated: Astro re-attaches cookies after middleware) |
| 2. Markers + mechanic alert | `data-testid` vocabulary, `loadError` branch on `/dashboard/mechanic` | Accidental visual change to dashboards |
| 3. HTTP suite | `tests/http/**`, config/script, fixture exports, render plus routing tests | Local auth rate limit (30 per 5 min) on repeated runs |
| 4. CI + test plan | `test:http` step in the `smoke` job; test-plan §3/§4/§5/§6 updated | CI flakiness if preview is not ready (reuses the existing poll) |

**Prerequisites:** local Supabase (`npx supabase start`), a Phase 1 suite that works, Node 22.
**Estimated effort:** about 2–3 sessions across 4 phases.

## Open Risks & Assumptions

- The production Cloudflare edge's behavior on a buffered 500 is assumed to match preview/workerd. This was not
  verified on a deployed worker.
- The HTTP suite, `test:db` and smoke share one local auth rate-limit bucket. Rapid local reruns (about 3 or more
  within 5 minutes) can hit HTTP 429.
- Buffering removes streaming for HTML pages. This is assumed negligible for small, DB-bound dashboards.

## Success Criteria (Summary)

- A render error on a dashboard is a 500 with a visible message, never a blank 200.
- CI fails if a seeded entry or client doesn't render for its owner, if foreign data appears, or if a client reaches
  mechanic pages or writes.
- The test-plan §6.3 cookbook lets the next contributor add a page test without this conversation.
