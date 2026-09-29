# Shareable Vehicle History Link — Plan Brief

> Full plan: `context/changes/shareable-vehicle-history-link/plan.md`

## What & Why

A client selling their car wants to show a prospective buyer a verified service history without handing over the paper booklet or their login (roadmap S-03, PRD FR-005). This change lets the client generate a 24-hour, read-only public link. The link must never reveal cost, so the redacted-view contract is the main risk.

## Starting Point

The client dashboard already shows the client's single vehicle and its full service history, including cost, through RLS scoped to `auth.uid()`. There is no anonymous read path at all: every policy requires a signed-in user, and there is no service-role key.

## Desired End State

The dashboard has a "Share history" card. From it the client creates, copies, replaces or revokes one active link, and sees when it expires (in Polish local time). Anyone opening `/share/<token>` without logging in sees make, model and registration, plus each entry's service type, date and mileage, newest first. Unknown, expired or revoked links all show the same 404 page.

## Key Decisions Made

| Decision                 | Choice                                                     | Why (1 sentence)                                                                                  |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Public fields            | Service type, service date, mileage, plus make/model/registration | Mileage and registration are what a buyer checks; notes are dropped because free text can contain prices. |
| Link model               | One active link per vehicle; new replaces old; Revoke button | Simple mental model, and a link sent to the wrong person can be closed at once.                   |
| Token storage            | Plaintext, 256-bit random, base64url                       | The client can re-copy the link for the full 24h; short life and read-only access limit leak impact. |
| Invalid / expired UX     | One identical 404 page for all cases                       | Does not reveal whether a token ever existed.                                                     |
| Anonymous read mechanism | `security definer` function with an explicit column allow-list | Redaction and expiry are enforced in the database, and no service-role key is added.         |
| Verification             | Vitest helpers, a smoke step for the public 404, manual SQL checks | Uses existing tooling; no new SQL test framework.                                           |

## Scope

**In scope:**

- `share_links` table with client-only RLS
- create/revoke RPCs
- public read function
- two form POST endpoints
- dashboard card with Copy
- `/share/[token]` page with `noindex`, `no-referrer` and `no-store` headers
- smoke step
- kitchen-sink states and screenshots

**Out of scope:**

- cost, notes and next-due fields on the public page
- multiple or per-buyer links
- configurable expiry
- distinguishing an expired link from an unknown one
- hashed tokens
- cleanup of expired rows
- mechanic visibility of links
- pgTAP
- view logging

## Architecture / Approach

The database is the boundary:

- **Writes.** `create_share_link()` and `revoke_share_link()` are `security invoker` RPCs, granted only to `authenticated` and gated by RLS policies for the `client` role on the caller's own vehicle.
- **Public read.** `get_shared_vehicle_history(token)` is `security definer`, granted to `anon`. It returns a JSON object built from named columns only, or `null` when the token is unknown, expired or revoked.

Astro reuses the existing pattern (form POST, then redirect with `?error=`) for the private side. It adds one server-rendered public page that rejects malformed tokens before calling the database.

## Phases at a Glance

| Phase                                  | What it delivers                                         | Key risk                                                                       |
| -------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1. Database                            | Table, RLS, create/revoke RPCs, redacted public read function | Supabase's default `EXECUTE` grants to `anon`; missing revokes would widen the boundary |
| 2. Client generates and revokes        | API routes, tested helpers, dashboard "Share history" card | Expiry shown in UTC instead of Europe/Warsaw                                   |
| 3. Public share page and gates         | `/share/[token]`, uniform 404, headers, smoke step, screenshots | Accidentally reusing `ServiceHistory.astro`, which renders cost           |

**Prerequisites:** S-01 is done (client dashboard, vehicle and entries). Local Supabase (Docker) is needed for Phase 1 checks and for smoke.

**Estimated effort:** about 2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Mileage is shown publicly. This goes beyond the literal "service type and dates" wording of FR-005, as an explicit decision in this plan.
- Plaintext tokens mean anyone with read access to the database sees working links for up to 24h. This is accepted given the short lifetime and read-only scope.
- `extensions.gen_random_bytes` (pgcrypto) is assumed available, which is the Supabase default.

## Success Criteria (Summary)

- A client creates a link on the dashboard, and a logged-out buyer opens it and sees type, date and mileage, with no cost or notes, even in the page source.
- Replacing, revoking or letting the link expire makes the old URL return the same 404.
- Lint, tests, build and smoke pass.
