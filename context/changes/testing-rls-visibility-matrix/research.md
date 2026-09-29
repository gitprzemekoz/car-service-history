---
date: 2026-09-29T12:40:19+02:00
researcher: Claude (Opus 5.5) for Przemek Kozinski
git_commit: f763bdb3a779ed50efbb3aa45a454274bd2a6175
branch: main
repository: gitprzemekoz/car-service-history
topic: "RLS visibility matrix + CI test gate (test-plan Phase 1, risk #2)"
tags: [research, rls, supabase, vitest, ci, test-plan]
status: complete
last_updated: 2026-09-29
last_updated_by: Claude (Opus 5.5)
---

# Research: RLS visibility matrix + CI test gate

**Date**: 2026-09-29T12:40:19+02:00
**Researcher**: Claude (Opus 5.5) for Przemek Kozinski
**Git Commit**: f763bdb3a779ed50efbb3aa45a454274bd2a6175
**Branch**: main
**Repository**: gitprzemekoz/car-service-history

## Research Question

For rollout Phase 1 of `context/foundation/test-plan.md` (risk #2): what must a
DB-integration suite (Vitest + local Supabase, one anon-key client per signed-in
role) cover to prove that each role (client, mechanic) reads exactly its own rows
and gets zero foreign rows, and how does `npm test` get into CI? Ground: RLS
policies per table, how test users get a role, anon vs service-role key, and the
existing CI/test infrastructure.

## Summary

- **Six RLS-enabled tables in 4 migrations.** They are `profiles`, `clients`,
  `vehicles`, `service_entries`, `share_links`, `service_entry_revisions`. Every
  SELECT policy compares against `auth.uid()`. There is no `workshops` table:
  "workshop" = one mechanic (`clients.mechanic_id`). "Another workshop" in risk #2
  therefore means "another mechanic's clients".
- **Roles come from a signup trigger, not from JWT claims.** `handle_new_user()`
  sets role `client` when the signup email matches an unclaimed `clients` row, and
  `mechanic` otherwise (`supabase/migrations/20260923120000_service_entry_loop.sql:26-55`).
- **So every fixture can be built with the anon key.** Local config has
  confirmations off (`supabase/config.toml:209`), so `signUp` returns a session
  immediately. The sequence is: mechanic signs up → mechanic calls
  `create_client_with_vehicle` → client signs up with that email → mechanic
  inserts an entry → client calls `create_share_link`.
- **The service-role key appears nowhere in the repo**, and CI filters it out
  (`.github/workflows/ci.yml:42`).
- **`npm test` runs nowhere in CI** (`.github/workflows/ci.yml:10-55`), nor in the
  pre-commit hook. The only job with a local Supabase is `smoke`
  (`ci.yml:39-42`). A DB suite under the current include glob
  (`vitest.config.ts:11`) would also run in plain local `npm test` and fail
  without a running stack.
- **"Empty result means correct" is a real trap here.** An RLS-filtered SELECT
  returns zero rows with no error. A policy that hides everything would therefore
  pass every "foreign = 0" assertion unless each one is paired with an
  owner-side positive control of the same query shape.

## Detailed Findings

### Visibility model: SELECT policies per table (current state after all 4 migrations)

| Table | SELECT policies | Expected visibility |
|---|---|---|
| `profiles` | `profiles_select_own`: `id = auth.uid()` (`20260922120000_roles_and_domain_schema.sql:20-22`). The update policy was dropped (`20260923120000_service_entry_loop.sql:63`). | Own row only, for every role. A mechanic does NOT see their clients' profiles. |
| `clients` | `clients_select_mechanic`: `mechanic_id = auth.uid()` (`…22120000…:41-43`). `clients_select_own`: `user_id = auth.uid()` (`:53-55`). | Mechanic: their own clients. Client: their own row. |
| `vehicles` | `vehicles_select_mechanic` / `vehicles_select_client`, both via `exists(clients …)` (`…22120000…:67-75`, `:97-105`) | Mechanic: vehicles of their clients. Client: own vehicle (one per client, `…23120000…:13`). |
| `service_entries` | `service_entries_select_mechanic` joins vehicle→client on `clients.mechanic_id` (`…22120000…:122-131`). `service_entries_select_client` on `clients.user_id` (`:157-166`). | Mechanic visibility is keyed on the *client's* mechanic, not on `service_entries.mechanic_id`. |
| `share_links` | `share_links_select_client`: owner client AND `profiles.role = 'client'` (`20260928130000_share_links.sql:25-39`). There are no mechanic policies (comment `:22-23`). | Owning client only. The owning mechanic sees zero rows **by design** (`context/changes/shareable-vehicle-history-link/plan.md:90-91`). |
| `service_entry_revisions` | RLS on, no policies at all (`20260929120000_service_entry_edits.sql:12-14`, `:31`) | Zero rows for every API role. |

- **Only the write policies check the caller's role; the SELECT policies don't.**
  The role check was added to insert/update policies only; the migration comment
  says the SELECT policies are unchanged (`…23120000…:57-58`). Of the SELECT
  policies, only `share_links_select_client` checks the role.
- **Nothing is filtered on the anon role; it just sees nothing.** With no session,
  `auth.uid()` is null, so every policy above evaluates false. An anon client is
  expected to get zero rows from every table. This is an inference from the policy
  text: no policy targets `anon` explicitly, and I did not inspect the default
  table grants.
- **The PRD requirement this proves:** a client's data is visible only to that
  client, their assigned mechanic, and valid share-link holders
  (`context/foundation/prd.md:76`). A mechanic sees only their own workshop's
  clients (`prd.md:64-65`).
- **Share-link public reads are out of scope here.** The anon read path
  `get_shared_vehicle_history` is a `security definer` RPC
  (`20260928130000_share_links.sql:147-197`). It belongs to risk #5 / Phase 3.
  For this phase, only the table-level visibility of `share_links` is in scope.

### Role assignment and fixture construction (no service-role key needed)

- **The trigger decides the role.** `on_auth_user_created` → `handle_new_user()`
  (`…22120000…:202-205`, redefined at `…23120000…:26-55`).
  - If the signup email (lowercased) matches a `clients` row with
    `user_id is null`, it links the row and inserts `profiles.role='client'`.
  - Otherwise it inserts `role='mechanic'`.
- **Mechanics create clients through the RPC.** `create_client_with_vehicle` is
  `security invoker` and granted to `authenticated`, so it creates a
  `clients` + `vehicles` pair under RLS (`…23120000…:165-192`). Duplicate emails
  raise 23505 (`:162-163`, unique index `:21`).
- **Signup is instant locally.** Settings are `enable_signup = true`
  (`config.toml:169`, `:204`) and `enable_confirmations = false`
  (`config.toml:209`), so `signUp` yields a session without email confirmation.
- **Auth rate limit:** `sign_in_sign_ups = 30` per 5 minutes per IP
  (`config.toml:190`). One run that creates two workshop pairs uses 4 sign-ups.
  Repeated local re-runs within 5 minutes can hit the limit.
- **The seed has one pair only** (`supabase/seed.sql:12-79`):
  - mechanic `mechanic@example.test` (`1111…`), client `client@example.test`
    (`3333…`), one vehicle, one "Oil change" entry; password `password123`.
  - There is no second workshop. Earlier changes created one by hand
    (`context/changes/mechanic-edits-service-entry/plan.md:222`).
- **Why the seed pair can't anchor exact counts.** There are no DELETE policies
  on `clients`, `vehicles` or `service_entries` (checked in all 4 migrations).
  Rows created by tests or by hand locally stay put until `supabase db reset`.
  Exact "reads exactly its own rows" counts therefore hold for freshly created
  users (unique emails per run, as `scripts/smoke.mjs:5-6` does). They do not
  hold for the seed pair on a used local DB.
- **Revisions have no observable positive control.** `service_entry_revisions`
  is unreachable through the API. An anon-key suite can create a revision (a
  mechanic editing their entry fires `service_entry_before_update`,
  `…29120000…:41-99`), but it cannot confirm through the API that the row
  exists. Proving "row exists but is invisible" needs a privileged read (a direct
  Postgres connection or the service-role key), used for verification only.

### Keys and client construction

- **The app uses the anon key only.** `.env.example` has only `SUPABASE_URL` and
  `SUPABASE_KEY` (the anon key). The Astro env schema is declared in
  `astro.config.mjs:17-22`. A grep for `service_role|SERVICE_ROLE` across `src`,
  `scripts`, `supabase/migrations` and `.github` returns nothing.
- **Tests can't reuse the app's client factory.** `src/lib/supabase.ts:1-21`
  builds an `@supabase/ssr` server client from `astro:env/server`, which Vitest
  cannot resolve without Astro's Vite config. A DB test needs its own
  `createClient(url, anonKey)` from `@supabase/supabase-js` (already a dependency,
  `package.json`) per role, reading `process.env`.
  - Inference, not verified: Vitest does not automatically put `.env` values
    into `process.env`, so the env loading mechanism is a plan decision.
- **The "one client per role" rule has a concrete trap.** Signing in two users
  on one supabase-js client instance replaces the session, so each role needs its
  own instance. This is general supabase-js behaviour, not verified in this repo.
- **The app filter is not what the test checks.** The client dashboard adds
  `.eq("user_id", user.id)` on top of RLS (`src/pages/dashboard.astro:26`). This
  is deliberate: `clients_select_mechanic` would also match for a mechanic
  (`context/archive/2026-09-23-first-service-entry-visible-to-client/reviews/impl-review.md:24`).
  The matrix must test the RLS layer without such app filters, or it proves the
  app filter instead of the policy.

### CI and existing test infrastructure

- **Workflow file:** `.github/workflows/ci.yml` is the only workflow. It triggers
  on push and PR to `main` (`:3-7`).
- **Job `ci`** (`:10-25`) runs `npm ci` → `astro sync` → lint → `astro check` →
  build. It has no Supabase and no tests.
- **Job `smoke`** (`:27-55`):
  - `supabase/setup-cli@v1` at `latest` (`:35-37`).
  - `supabase start -x …` (`:41`) applies migrations and seed on a fresh stack.
  - `supabase status -o env | grep -E '^(API_URL|ANON_KEY)='` (`:42`) keeps only
    the URL and anon key.
  - It writes `.env`/`.dev.vars`, runs build + preview, then `npm run smoke`
    (`:43-53`), and `supabase stop` under `if: always()` (`:54-55`).
  - It is the one existing place a DB suite can run in CI without a second
    `supabase start`.
- **Vitest config** (`vitest.config.ts`): `environment: "node"` (`:10`), include
  `src/**/*.test.ts(x)` (`:11`), no setup/globalSetup files.
- **Existing tests:** 4 unit test files, all in `src/lib/`
  (`service-history`, `share-link`, `utils`, `validation`). None touches Supabase.
- **Smoke script:** `scripts/smoke.mjs` works only over HTTP against the app
  (`/api/auth/signup`, `/api/auth/signin`, `:43-57`). It never talks to Supabase
  directly. Reusable ideas: unique email per run (`:5-6`) and a table-driven
  runner (`:38-83`).
- **Gate placement consequence.** Adding `npm test` to job `ci` as-is would fail
  once DB tests exist, because that job has no stack. Adding it to `smoke` after
  `ci.yml:42` works, but then unit and DB tests share one command. Whether DB
  tests are separated (a separate include/project/script) or run in one
  `npm test` is a plan decision (see Open Questions).

## Code References

- `supabase/migrations/20260922120000_roles_and_domain_schema.sql:10-205` — role enum, `profiles`, domain tables, original SELECT policies, signup trigger
- `supabase/migrations/20260923120000_service_entry_loop.sql:26-55` — current `handle_new_user()` (case-insensitive match)
- `supabase/migrations/20260923120000_service_entry_loop.sql:63-158` — role-gated insert/update policies; SELECT unchanged
- `supabase/migrations/20260923120000_service_entry_loop.sql:165-192` — `create_client_with_vehicle` (security invoker, authenticated only)
- `supabase/migrations/20260928130000_share_links.sql:25-39` — `share_links_select_client` (role-gated)
- `supabase/migrations/20260928130000_share_links.sql:80-118` — `create_share_link` (fixture for a share-link row)
- `supabase/migrations/20260929120000_service_entry_edits.sql:16-31` — `service_entry_revisions`, RLS with no policies
- `supabase/config.toml:169,190,204,209` — signup on, rate limit, confirmations off
- `supabase/seed.sql:12-79` — single seeded mechanic/client pair
- `.github/workflows/ci.yml:27-55` — smoke job with local Supabase; `:42` key filter
- `vitest.config.ts:10-11` — node env, `src/**` include
- `src/lib/supabase.ts:1-21` — app client (astro:env; not usable from Vitest)
- `src/pages/dashboard.astro:26` — app-side `user_id` filter layered over RLS

## Architecture Insights

- **Access control lives in RLS, keyed on `auth.uid()`, with roles in `profiles`.**
  SECURITY DEFINER is reserved for the signup trigger, the revisions trigger and
  the public share-link read. Every user-facing write RPC is SECURITY INVOKER, so
  RLS still decides (`…23120000…:160-161`, `…28130000…:74-76`).
- **Workshop isolation = mechanic isolation.** One mechanic = one workshop is a
  recorded decision
  (`context/archive/2026-09-22-roles-and-domain-schema-foundation/plan-brief.md:21`).
  Multi-mechanic workshops would need a schema migration (`plan-brief.md:52`).
  In that case this matrix would need a "same workshop, other mechanic" row.
- **Proposed matrix for the plan** (derived from the policy table above):
  - Actors: anon, mechanic A, client A, mechanic B, client B. The A and B pairs
    are fresh per run.
  - Resources: the six tables.
  - Each cell asserts an exact own-row set (by id) or zero rows with
    `error === null`.
  - Every zero-row assertion targets a known foreign id (`.eq('id', foreignId)`)
    that the owner can see in the same run. This is the positive control that
    defeats "empty result means correct result".

## Historical Context (from prior changes)

- **Every earlier change kept automated RLS tests out of scope and checked RLS by
  hand in Studio:**
  - F-01: `context/archive/2026-09-22-roles-and-domain-schema-foundation/plan.md:36`, `:199`
  - S-01: `context/archive/2026-09-23-first-service-entry-visible-to-client/plan.md:39`, `:259`
  - S-02: `context/changes/mechanic-edits-service-entry/plan.md:13`, `:33`, `:213`

  Supported. This phase is the first automated coverage.
- **S-01 found and closed a real hole.** Insert policies without a role check
  let a client create a `clients` row naming themselves as mechanic
  (`context/archive/2026-09-23-first-service-entry-visible-to-client/plan.md:27`, `:72`).
  Supported by the current policies (`…23120000…:68-88`). This evidence supports
  the "authenticated means authorized" challenge. It is write-side, so it belongs
  to Phase 3.
- **An RLS-blocked update returns 0 rows, not an error**
  (`context/changes/mechanic-edits-service-entry/plan.md:22`). This is the same
  mechanism as the zero-row SELECT, and it is why each zero-row assertion needs
  its positive control.
- **The `f763bdb` blank-dashboard incident was a migration-ordering bug, not a
  policy bug.** The fix is recorded in
  `context/changes/mechanic-edits-service-entry/reviews/impl-review.md:75-83`.
  Supported. It belongs to risk #3 / Phase 4, not to this phase.
- **An open review finding touches this table only on the write side.** The
  revisions table keeps the default anon/authenticated grants and is protected
  only by RLS-with-no-policies
  (`context/changes/mechanic-edits-service-entry/reviews/impl-review.md:45-52`, F2).
  Still open. A zero-row read assertion on `service_entry_revisions` covers its
  read side here.

## Related Research

- None: no other `research.md` covers RLS testing.
- `docs/reference/contract-surfaces.md` does not exist; there is no
  `docs/reference/` directory.

## Open Questions (plan decisions, not research gaps)

1. **Where the gate runs:**
   - Option A: `npm test` in the `smoke` job after `ci.yml:42`, with
     `SUPABASE_URL`/`SUPABASE_KEY` exported from `supabase.env`.
   - Option B: a separate `test:db` script or Vitest project, with `npm test`
     staying unit-only and also running in job `ci`.
2. **Local behaviour without a stack:** should the DB suite fail or skip when
   env/stack is missing? A silent skip in CI would recreate the "green but
   untested" failure. If skipping is allowed locally, CI must still fail.
3. **Privileged verification:** is a direct Postgres/service-role read acceptable
   for *fixture verification only*? It would prove that a revision row exists for
   the revisions zero-row cell. The alternative is to accept an unverified zero
   for that one cell. The test-plan anti-pattern forbids *querying under test*
   with the service-role key, not necessarily fixture setup.
4. **Fixture reuse vs rate limit:** fresh users per run (exact counts, 4 sign-ups
   per run) vs fixed test emails with sign-in fallback (fewer sign-ups, but rows
   accumulate on local DBs).
5. **Test-plan backport candidate:** the §2 wording "another workshop's data"
   maps to "another mechanic's clients", because there is no workshop entity.
   This is wording only; no correction to Source or guidance is needed.
