# Post-login Role Dashboard Redirect — Plan Brief

> Full plan: `context/changes/login-role-dashboard-redirect/plan.md`

## What & Why

After signing in, users currently land on the generic welcome page and must click "Dashboard". They should go straight to their own dashboard — mechanics to the mechanic dashboard, clients to the client dashboard.

## Starting Point

`src/pages/api/auth/signin.ts` redirects successful sign-ins to `/`. The middleware already routes `/dashboard` by role (mechanic → `/dashboard/mechanic`, others stay; fails closed on missing profile; 503 on outage), and that routing is covered by HTTP tests.

## Desired End State

Sign-in responds `302 → /dashboard`; a client ends on the client dashboard and a mechanic ends on `/dashboard/mechanic`, verified by HTTP tests and manually in the UI.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Redirect mechanism | Sign-in redirects to `/dashboard`; middleware picks the role dashboard | Keeps role routing (and its outage/missing-profile handling) in one tested place; cost is one extra hop for mechanics. |
| Scope | Only the post-login redirect | Exactly what was asked; signed-in users visiting auth pages are untouched. |

## Scope

**In scope:** sign-in success target; `signInAs` test helper; new HTTP "sign-in landing" tests; e2e setup comment.

**Out of scope:** role lookup in the sign-in endpoint; redirecting signed-in users away from auth pages; `?next=` return URLs; sign-up/sign-out changes.

## Architecture / Approach

`POST /api/auth/signin` → `302 /dashboard` → middleware → (mechanic) `302 /dashboard/mechanic` | (client) render client dashboard.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Redirect sign-in to the dashboard | New redirect target + tests proving each role's landing page | HTTP suites break if `signInAs` isn't updated in the same change |

**Prerequisites:** local Supabase + `npm run build && npm run preview` for HTTP tests.
**Estimated effort:** < 1 session, 1 phase.

## Open Risks & Assumptions

- Assumes a user with a missing profile should land on the client dashboard (existing fail-closed middleware behaviour).

## Success Criteria (Summary)

- A client who signs in sees the client dashboard immediately.
- A mechanic who signs in sees the mechanic dashboard immediately.
- Failed sign-in still shows the error on the sign-in page.
