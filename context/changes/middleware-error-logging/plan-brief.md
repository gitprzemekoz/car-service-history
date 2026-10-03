# Structured error logging helper and middleware that fails loudly — Plan Brief

> Full plan: `context/changes/middleware-error-logging/plan.md`
> Research: `context/audits/observability/2026-10-03_dashboard-entries.md` (observability audit, used as research input)

## What & Why

When Supabase is down, the app today pretends nothing happened: a signed-in user is redirected to sign-in as if logged out, a mechanic is shown the client's empty view, and nothing is logged. Render crashes leave only an unstructured stack line. This change adds one structured logging helper and makes the middleware tell "no session / no data" apart from "Supabase failed", closing audit findings D1, D2 and D13.

## Starting Point

`src/middleware.ts` reads only `data` from `getUser()` and the profile query, so every error becomes "anonymous" or "no profile". `src/` has zero `console` calls; Astro's own `console.error(err.stack)` is the only log channel.

## Desired End State

An outage on `/dashboard/**` returns a 503 "temporarily unavailable" page and one JSON log line naming the failing stage. Public pages keep working anonymously but log the outage. Render exceptions log route, user and cause before Astro's 500 page. Normal logged-out, expired-token and role-redirect behaviour is unchanged.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Protected-route outage response | 503 + static HTML page | Correct status for monitoring and no loop through `500.astro`, which re-runs middleware | Plan |
| Public-route outage | Log, continue as anonymous | Home, sign-in and share links keep working; outage is still visible | Plan |
| Signed-in user without profile row | `warn` log + today's fail-closed redirect | Makes the integrity problem visible without changing role routing or its tests | Plan |
| Rejected / expired token (AuthApiError 4xx) | Anonymous, no log | Normal traffic; logging it would be noise | Plan |
| Log format | Single-line JSON via `console.error` / `console.warn` | Workers Logs indexes JSON fields; zero dependencies | Plan |
| Path in logs | `routePattern` + path with `/share/<token>` masked, no query | Share tokens and `?error=` messages are sensitive | Plan |
| Render exception | Log with context, then rethrow | Keeps Astro's 500 page; Astro's extra stack line is accepted | Plan |
| Scope | Middleware only | Pages and API routes are audit steps 3–4, separate changes | Research |

## Scope

**In scope:**
- `src/lib/log-error.ts`, `src/lib/session-state.ts`, `src/lib/service-unavailable.ts` (+ unit tests)
- `src/middleware.ts` wiring

**Out of scope:**
- Dashboard pages, API routes, share/auth endpoints (D3–D12, P1–P5)
- Error tracker SDK, alert rules, release tagging, `wrangler.jsonc`
- `500.astro` redesign, browser-side capture

## Architecture / Approach

Two plain modules hold every decision: `log-error` serializes any error (with `cause`, PostgREST `code`/`details`/`hint`) into one JSON line, and `session-state` classifies Supabase results into signed-in / anonymous / unavailable and found / missing / unavailable. The middleware calls them, returns a static 503 on protected routes when Supabase is unavailable, and wraps rendering in a log-and-rethrow `try/catch`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Logging helper + classification | Unit-tested `log-error` and `session-state` modules, no behaviour change | Misclassifying auth errors (noise vs hidden outages) |
| 2. Middleware wiring | 503 on protected-route outage, structured logs, render try/catch | Breaking role redirects; error page re-entering middleware |

**Prerequisites:** local Supabase (`npx supabase start`) for `npm run test:http` and manual checks.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Assumes Workers Logs keeps `console.error`/`console.warn` JSON lines (observability is enabled in `wrangler.jsonc`); nobody alerts on them yet.
- Each render crash will appear twice in logs (structured line + Astro's stack line) until a tracker replaces Astro's log.
- `/api/*` routes still redirect on Auth outage; only the middleware log line is added for them here.

## Success Criteria (Summary)

- With Supabase down, a signed-in user on the dashboard sees "temporarily unavailable" (503), not a sign-in page or the wrong role's view.
- Every Supabase outage and render crash leaves one searchable JSON log line with stage, route and user id.
- Normal sign-in, logout and role routing behave exactly as before (HTTP suite green).
