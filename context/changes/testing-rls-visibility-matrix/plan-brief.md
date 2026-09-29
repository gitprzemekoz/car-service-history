# RLS Visibility Matrix + CI Test Gate — Plan Brief

> Full plan: `context/changes/testing-rls-visibility-matrix/plan.md`
> Research: `context/changes/testing-rls-visibility-matrix/research.md`

## What & Why

Rollout Phase 1 of `context/foundation/test-plan.md`, covering risk #2: an RLS policy or migration change could hide a client's own data, or expose another client's or another workshop's data. The plan adds an automated proof that each role reads exactly its own rows on a real database, and makes that proof a required CI gate. Until now, RLS has only been checked by hand in Studio.

## Starting Point

Six RLS tables (`profiles`, `clients`, `vehicles`, `service_entries`, `share_links`, `service_entry_revisions`) are governed by `auth.uid()` policies across 4 migrations. Roles are set by a signup trigger. CI starts local Supabase only for the smoke job and runs `npm test` nowhere. There is no DB test suite.

## Desired End State

`npm run test:db` builds two fresh workshop pairs through the anon key and asserts a 5-actor × 6-table visibility matrix. If Supabase isn't running, it fails loudly. CI runs `npm test` (unit) in job `ci` and `npm run test:db` in job `smoke`. A loosened or over-tightened SELECT policy turns CI red.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Key used | Anon key only, one supabase-js client per actor | The service-role key bypasses RLS; fixtures can be built under RLS through signUp + RPCs. | Research / Plan |
| CI placement | `test:db` (own config, `tests/db/`) in job `smoke`; `npm test` unit-only in job `ci` | Reuses the already-started stack, and unit tests stay runnable without Docker. | Plan |
| Missing stack | Always fail loudly (locally and in CI) | A green run that tested nothing is the failure mode this phase exists to prevent. | Plan |
| Revisions cell | Indirect control: edit sets `updated_at`, then zero rows for every actor | Keeps the suite strictly anon-key; the same trigger writes both. | Plan |
| Fixtures | Two fresh pairs per run (unique emails); seed pair not used | Exact own-row sets stay correct on a used local DB (no DELETE policies). | Research / Plan |
| Assertion shape | Exact unfiltered id set + foreign-id `.in()` read → `[]` with `error === null` | An empty result counts only when the owner sees the same ids in the same run. | Research |
| "Workshop" meaning | Another workshop = the other mechanic's pair | There is no workshops table; one mechanic = one workshop. | Research |

## Scope

**In scope:**
- `vitest.db.config.ts` and the `test:db` script
- `tests/db/` (env guard, client factory, fixtures, matrix test)
- `ci.yml` steps
- `test-plan.md` §3/§4/§5/§6.2/§6.6 bookkeeping

**Out of scope:**
- Write-path abuse and share-link redaction/expiry (Phase 3)
- Dashboard rendering (Phase 2)
- Migration parity (Phase 4)
- Service-role key or direct Postgres access
- Fixing the open revisions-trigger findings
- Test-row cleanup

## Architecture / Approach

A single test file owns a `beforeAll` fixture. The fixture signs up mechanic A/B via the anon key, creates their clients with `create_client_with_vehicle`, then signs up clients A/B. That creates the client role, and the fixture checks it. Next it adds a service entry, edits it (creating a revision), and creates a share link. A table-driven expectation map, derived from the policy text rather than from query output, then drives 30 exact-set cells plus foreign-id zero checks.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. DB test harness and fixtures | `test:db` runner, fail-loud env guard, per-actor clients, two-pair fixture with role sanity checks | Trigger ordering: a client signing up before its row exists becomes a mechanic |
| 2. RLS visibility matrix | 30 exact-set cells + foreign-id zero checks; manual mutation checks (exposing + hiding) | Expectations copied from query output instead of from the policies (oracle problem) |
| 3. CI gate and test-plan update | `npm test` in `ci`, `test:db` in `smoke`; §6.2 cookbook pattern | CI `.env` must exist before `test:db` runs |

**Prerequisites:** Docker + `npx supabase start` locally; Node ≥ 20.12 (`process.loadEnvFile`; CI uses Node 22).
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- **Rate limit:** 4 sign-ups per run against 30 per 5 min. More than about 7 rapid local re-runs can hit HTTP 429.
- **Revisions check is inferred.** A revision row "exists" only by inference from `updated_at`. If the trigger ever stopped writing revisions while still setting `updated_at`, this suite wouldn't notice.
- **Rows pile up locally** across runs until `npx supabase db reset`. Assertions are unaffected, because they are scoped to fresh users.

## Success Criteria (Summary)

- **Local runs:** `npm run test:db` is green against local Supabase, red when the stack is down, and red when a SELECT policy is loosened or tightened.
- **CI:** both jobs run their suites, and an RLS regression fails the `smoke` job.
- **Test plan:** `test-plan.md` §6.2 gives later phases a copyable RLS test pattern.
