# RLS Visibility Matrix + CI Test Gate Implementation Plan

## Overview

Rollout Phase 1 of `context/foundation/test-plan.md` (risk #2). Add a DB-integration Vitest suite that runs against local Supabase with the **anon key only**. It creates two fresh workshop pairs per run and proves a 5-actor × 6-table read-visibility matrix: every actor reads exactly its own rows, and foreign rows come back as zero rows with no error. Each zero-row assertion is paired with a positive control. The suite then becomes a required CI gate (`test:db` in the `smoke` job), and the existing unit suite (`npm test`) is added to the `ci` job.

## Current State Analysis

(From `context/changes/testing-rls-visibility-matrix/research.md`.)

- **Six RLS tables across 4 migrations.** SELECT visibility per table is in the research table under "Visibility model". Every SELECT policy compares against `auth.uid()`. There is no `workshops` table: one mechanic = one workshop.
- **Roles come from a trigger.** `handle_new_user()` sets the role on signup: `client` if the email matches an unclaimed `clients` row, `mechanic` otherwise (`supabase/migrations/20260923120000_service_entry_loop.sql:26-55`).
- **Local signup is instant.** `enable_confirmations = false` (`supabase/config.toml:209`), so `signUp` returns a session.
- **Fixtures need no privileged key.** Every step can run under RLS with the anon key: `create_client_with_vehicle` (`…23120000…:165-192`), a `service_entries` insert, `create_share_link` (`20260928130000_share_links.sql:80-118`) and a mechanic update.
- **The service-role key is unused.** It appears nowhere in the repo, and CI keeps only `API_URL`/`ANON_KEY` (`.github/workflows/ci.yml:42`).
- **`npm test` runs nowhere in CI.** Only the `smoke` job starts Supabase (`ci.yml:39-42`). The unit Vitest config includes `src/**` only (`vitest.config.ts:11`).
- **Tests can't reuse the app's Supabase client.** `src/lib/supabase.ts` imports `astro:env/server`, which Vitest cannot resolve.
- **Earlier changes checked RLS by hand only**, in Studio. This is the first automated coverage.

## Desired End State

- `npm run test:db` works against a running local Supabase.
  - With the stack up, it builds workshop pairs A and B from scratch and asserts the full visibility matrix.
  - With no stack or missing env, it **fails** with a clear message, both locally and in CI.
- `npm test` keeps running only the unit tests in `src/**` and needs no Docker.
- CI runs `npm test` in job `ci`. It runs `npm run test:db` in job `smoke` after local Supabase starts and before build/preview. A failing test fails the workflow.
- A locally loosened SELECT policy (e.g. `using (true)`) turns the suite red.
- `context/foundation/test-plan.md` shows Phase 1 done, with a §6.2 cookbook pattern that later phases reuse.

### Key Discoveries:

- **Five actors:** anon, mechanic A, client A, mechanic B, client B. "Another workshop" = the other mechanic's pair (research, "Architecture Insights").
- **Two by-design zero cells.** `share_links` is invisible to mechanics, including for their own client (`20260928130000_share_links.sql:22-39`). `service_entry_revisions` is invisible to every API role (`20260929120000_service_entry_edits.sql:12-14`, `:31`).
- **A foreign-id zero proves nothing alone.** An RLS-filtered read returns `[]` with `error: null`, so it must sit next to an owner-side read of the same id.
- **Fresh users make exact sets reliable.** There are no DELETE policies, so local rows accumulate across runs. Exact own-row sets hold only for users created in this run (research, "Role assignment").
- **Auth rate limit:** `sign_in_sign_ups = 30` per 5 min (`supabase/config.toml:190`). One run uses 4 sign-ups.
- **Linting and type-checking already cover `tests/`.** ESLint lints `**/*.{js,jsx,ts,tsx}` (`eslint.config.js:43`) and `tsconfig.json` includes `**/*`, so `tests/db/**` is picked up with no config change.

## What We're NOT Doing

- **Write-path abuse** (a cross-workshop insert/update is denied, history integrity). That is risk #4 / test-plan Phase 3. Writes here are fixture setup only; the fixture asserts only that they succeed.
- **The anon share-link read** (`get_shared_vehicle_history`: redaction, 24h expiry, wrong token). That is risk #5 / Phase 3.
- **Dashboard or HTTP-level rendering.** That is risk #1 / Phase 2. The matrix queries tables directly, with no app filters such as `src/pages/dashboard.astro:26`.
- **Migration parity or ordering checks.** That is risk #3 / Phase 4.
- **Using the service-role key, a direct Postgres connection, or mocks of Supabase** anywhere in the suite, including fixture setup and verification.
- **Using the seed pair** (`supabase/seed.sql`) in assertions.
- **Cleaning up test rows.** No DELETE policies exist; locally, rows are cleared by `supabase db reset`.
- **Fixing the open review findings** on the revisions trigger (`mechanic-edits-service-entry/reviews/impl-review.md` F1/F2).
- **Changing §1/§2 of `test-plan.md`.**

## Implementation Approach

The work is a separate Vitest config and directory (`tests/db/`) with its own script, so unit and DB runs never mix. A single test file owns the fixture in a `beforeAll`, so the 4 sign-ups happen once per run, with no parallel files competing for the rate limit. Each actor gets its own supabase-js client instance with session persistence off. The matrix is table-driven: one row per (actor, table) with the expected id set.

Each (actor, table) cell asserts two things:
1. An **unfiltered** `select('id')` returns exactly the expected id set. The set may be empty; it is an exact set, not "contains".
2. For non-owners, a read **filtered to the foreign pair's ids** returns `[]` with `error === null`. The owner's positive control for those same ids is already covered by assertion 1 in the owner's cell.

## Critical Implementation Details

- **Fixture ordering and state sequencing.**
  - The client row must exist before the client signs up, or the trigger makes that user a mechanic (`…23120000…:35-51`).
  - The fixture asserts each actor's own `profiles.role`. This catches that mis-assignment instead of letting it surface as confusing matrix failures.
  - Client emails must be lowercase: `clients_email_lowercase` check (`…23120000…:18-19`), and the RPC lowercases its input (`:181`).
- **Revisions positive control is indirect (decision).** After the mechanic edits their entry, assert that the returned row has a non-null `updated_at`. The same trigger that sets `updated_at` inserts the revision (`20260929120000_service_entry_edits.sql:64-90`). Then assert zero revision rows for every actor.
- **One supabase-js instance per actor.** Signing a second user into the same instance replaces the session. Create clients with `auth: { persistSession: false, autoRefreshToken: false }`.

## Phase 1: DB test harness and fixtures

### Overview

Stand up the separate DB-test runner, fail-loud env loading, per-actor clients, and the two-workshop fixture, with a sanity test proving that the fixture produced the intended roles and rows.

### Changes Required:

#### 1. DB Vitest config and script

**File**: `vitest.db.config.ts`, `package.json`

**Intent**: A dedicated config so DB tests run only via `npm run test:db`, never through `npm test`, and one file at a time so the fixture's sign-ups are not duplicated.

**Contract**:
- `vitest.db.config.ts`: `environment: "node"`, `include: ["tests/db/**/*.test.ts"]`, `fileParallelism: false`, and a `testTimeout` generous enough for auth round trips (e.g. 30s).
- New script `"test:db": "vitest run --config vitest.db.config.ts"`.
- `vitest.config.ts` stays unchanged; its `src/**` include already excludes `tests/`.

#### 2. Env loading and fail-loud guard

**File**: `tests/db/env.ts`

**Intent**: Read `SUPABASE_URL` / `SUPABASE_KEY` (the anon key, same names as `.env.example` and CI's `.env`, `ci.yml:46`) and stop the run with an actionable message when they are missing or the stack is unreachable. This rules out a green run that tested nothing (decision: always fail).

**Contract**:
- Load `.env` via Node's `process.loadEnvFile()` when the file exists. Explicit env vars are not overwritten.
- Throw if either var is missing, with a message naming `npx supabase start` and the two variable names.
- Probe `${SUPABASE_URL}/auth/v1/health` once; on a network error or non-2xx, throw with the same guidance.
- Export `{ url, anonKey }`. No service-role variable exists in this module or anywhere in `tests/db/`.

#### 3. Per-actor client factory

**File**: `tests/db/clients.ts`

**Intent**: Create an isolated anon-key supabase-js client for each actor.

**Contract**: `newClient(): SupabaseClient` built with `createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })` from `@supabase/supabase-js`. It does not import `src/lib/supabase.ts`.

#### 4. Workshop-pair fixture

**File**: `tests/db/fixtures.ts`

**Intent**: Build one complete workshop pair entirely through the anon key under RLS, and return every id the matrix needs.

**Contract**:
- `createWorkshopPair(label: "a" | "b", runId: string): Promise<WorkshopPair>`.
- `WorkshopPair` = `{ mechanic: { client, userId }, client: { client, userId }, clientRowId, vehicleId, entryId, shareLinkId }`.
- Emails: `rls-${runId}-${label}-mechanic@example.test` / `…-client@example.test`, all lowercase.
- Steps, in order. Every step throws on `error`.
  1. Mechanic `signUp`.
  2. Mechanic calls RPC `create_client_with_vehicle` with the client email. It returns `clientRowId`.
  3. Mechanic selects its vehicle id.
  4. Client `signUp` with that email.
  5. Mechanic inserts one `service_entries` row (own `mechanic_id`, the vehicle, `service_type`, `service_date`, `mileage`, `cost`) and gets its id back.
  6. Mechanic updates that entry's `notes` with `.select()`. Assert that exactly one row is returned and `updated_at` is non-null (indirect revision control).
  7. Client calls RPC `create_share_link`.
  8. Client selects its `share_links` row id.
- `runId` is unique per process (timestamp + random suffix).
- An anon actor is simply `newClient()` with no sign-in.

#### 5. Fixture sanity test

**File**: `tests/db/rls-visibility.test.ts` (created here, extended in Phase 2)

**Intent**: The `beforeAll` builds pairs A and B once. The first tests assert the fixture before any visibility claim relies on it.

**Contract**:
- Each actor's own `profiles` row has the expected role: mechanics `mechanic`, clients `client`.
- Each signed-in actor's `auth.getUser()` id matches the fixture's `userId`.
- All fixture ids are non-null and distinct between A and B.

### Success Criteria:

#### Automated Verification:

- `npm run test:db` passes against a running local Supabase (`npx supabase start`)
- `npm run test:db` fails with the guidance message when the stack is stopped (`npx supabase stop`)
- `npm test` still runs only the 4 existing unit files and passes without Supabase running
- `npm run lint` passes
- `npx astro check` passes

#### Manual Verification:

- Running `npm run test:db` twice in a row on the same local DB passes both times (fresh users per run, no collisions)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 2: RLS visibility matrix

### Overview

Assert the full actor × table read matrix with exact own-row sets and foreign-id zero checks, including the two by-design zero cells.

- **Behaviour asserted:** each role reads exactly its own rows, and foreign rows return `[]` without error.
- **Regression caught:** a policy or migration change that hides own data (the exact set goes short) or exposes foreign data (the exact set grows, or the foreign-id read goes non-empty).
- **Source:** research "Visibility model" table, test-plan §2 risk #2.
- **Edge cases:** anon, the owning mechanic on `share_links`, everyone on revisions.
- **Anti-patterns avoided:** the service-role key, mocks, and asserting only "no error" or only "empty".

### Changes Required:

#### 1. Matrix expectations

**File**: `tests/db/rls-visibility.test.ts`

**Intent**: A table-driven expectation map derived from the policies, not from running the queries. The expected sets come from the migration policy text (the oracle), so the test does not copy the implementation's output.

**Contract**: Expected unfiltered id set for each (actor, table). P = the actor's own pair; the other pair is foreign.

| Table | anon | mechanic (pair P) | client (pair P) |
|---|---|---|---|
| `profiles` | ∅ | {own userId} | {own userId} |
| `clients` | ∅ | {P.clientRowId} | {P.clientRowId} |
| `vehicles` | ∅ | {P.vehicleId} | {P.vehicleId} |
| `service_entries` | ∅ | {P.entryId} | {P.entryId} |
| `share_links` | ∅ | ∅ (by design, own client's link included) | {P.shareLinkId} |
| `service_entry_revisions` | ∅ | ∅ | ∅ |

#### 2. Exact-set assertions

**File**: `tests/db/rls-visibility.test.ts`

**Intent**: For every (actor, table) cell, one unfiltered `select('id')` must return exactly the expected set with `error === null`. This proves in one read both that own data is visible (a hidden own row fails) and that no foreign rows leak.

**Contract**:
- One `it` per cell (5 actors × 6 tables = 30), named `<actor> reads <table>: <expectation>`.
- Compare sorted id arrays for equality, not `toContain` or length checks.
- For `profiles`, the id column is the user id.
- For `service_entry_revisions`, select `id` as well; the expected set is ∅ for all actors.

#### 3. Foreign-id zero-row assertions with positive control

**File**: `tests/db/rls-visibility.test.ts`

**Intent**: Challenge "authenticated means authorized" and "empty result means correct result". Each signed-in actor explicitly targets the other pair's known ids and must get `[]` with no error. The same ids are proven visible to their owner in the same run (Change 2), so an empty result means denial, not missing data.

**Contract**:
- For each signed-in actor, and for each of `profiles`, `clients`, `vehicles`, `service_entries`, `share_links`: filter with `.in("id", foreignIds)`, where `foreignIds` are the other pair's ids for that table. Assert `data` equals `[]` and `error` is `null`.
- For each such check, reference in the test the owner cell that sees those ids, e.g. via a shared helper that asserts the owner's set first, or a precondition assertion in the same `it`.
- Anon uses the same foreign-id form against both pairs' ids.

### Success Criteria:

#### Automated Verification:

- `npm run test:db` passes with all 30 exact-set cells and all foreign-id checks green
- `npm run lint` passes
- `npx astro check` passes

#### Manual Verification:

- **Mutation check: an exposing policy turns the suite red.**
  1. In local Studio or psql, temporarily run `alter policy "vehicles_select_mechanic" on vehicles using (true);`.
  2. Run `npm run test:db`: the mechanic `vehicles` cells and foreign-id checks fail.
  3. Restore with `npx supabase db reset`.
- **Mutation check: a hiding policy turns the suite red.**
  1. Temporarily run `alter policy "service_entries_select_client" on service_entries using (false);`.
  2. The client `service_entries` exact-set cells fail. They must not pass as "empty".
  3. Restore with `npx supabase db reset`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 3: CI gate and test-plan update

### Overview

Make both suites required CI checks, and record the shipped pattern in the test plan.

### Changes Required:

#### 1. Unit tests in job `ci`

**File**: `.github/workflows/ci.yml`

**Intent**: Run the existing unit suite on every push and PR. It needs no Supabase.

**Contract**: Add a `npm test` step to job `ci`, after `npx astro check` and before `npm run build` (`ci.yml:21-22`).

#### 2. DB suite in job `smoke`

**File**: `.github/workflows/ci.yml`

**Intent**: Run `test:db` against the already-started local stack before build/preview, so an RLS regression fails fast and the smoke run does not have to start first.

**Contract**:
- Add a step `npm run test:db` right after "Configure secrets for build and preview" (`ci.yml:43-47`). That step writes `.env` with `SUPABASE_URL` / `SUPABASE_KEY`.
- Keep the `grep` at `ci.yml:42` unchanged; the service-role key stays out of the workflow.
- The existing `if: always()` `supabase stop` (`:54-55`) still runs.

#### 3. Test plan bookkeeping

**File**: `context/foundation/test-plan.md`

**Intent**: Close rollout Phase 1 in the plan and give later phases a reusable recipe. Only the sections owned by rollout bookkeeping are touched.

**Contract**:
- §3 row 1: Status → `done`.
- §4 "DB / RLS integration" row: Notes → the `tests/db/` + `vitest.db.config.ts` + `npm run test:db` pattern.
- §4 "CI gates" row: Notes → records that `npm test` and `test:db` now run.
- §5: the `npm test` gate row is split or reworded to name both `npm test` (job `ci`) and `npm run test:db` (job `smoke`).
- §6.2: replace the TBD with location (`tests/db/`), reference test (`tests/db/rls-visibility.test.ts`), fixture helper (`tests/db/fixtures.ts`), the rule "exact own-row set + foreign-id `[]` with `error === null`, anon key only", and the run command (`npx supabase start` then `npm run test:db`).
- §6.6: a dated note for Phase 1: fresh users per run, the 30-per-5-min sign-up limit, and the indirect revisions control.
- §1/§2: unchanged.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm test` passes
- `npm run test:db` passes against local Supabase
- `.github/workflows/ci.yml` contains `npm test` in job `ci` and `npm run test:db` in job `smoke`

#### Manual Verification:

- A pushed branch or PR shows both CI jobs green, with the `test:db` step output listing the matrix tests
- A throwaway PR that loosens one SELECT policy in a new migration makes the `smoke` job fail at `test:db` (optional but recommended; close the PR afterwards)
- `test-plan.md` §3/§4/§5/§6.2/§6.6 read correctly, and §1/§2 are untouched

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation.

---

## Testing Strategy

### Unit Tests:

- No new unit tests. The existing 4 files in `src/lib/` must keep passing under `npm test` without Supabase.

### Integration Tests:

- `tests/db/rls-visibility.test.ts`:
  - fixture sanity (roles, ids);
  - 30 exact-set cells (5 actors × 6 tables);
  - foreign-id zero checks for 4 signed-in actors × 5 tables, plus anon against both pairs.

### Manual Testing Steps:

1. `npx supabase start`, then run `npm run test:db` twice. Both runs are green.
2. `npx supabase stop`, then `npm run test:db`. It fails with the guidance message.
3. Mutation checks from Phase 2, one exposing and one hiding. Each makes the suite fail; `npx supabase db reset` restores.
4. After the push, both CI jobs are green.

## Performance Considerations

- **Sign-ups:** 4 per run, under `sign_in_sign_ups = 30` per 5 min (`supabase/config.toml:190`). More than about 7 back-to-back local runs within 5 minutes can hit HTTP 429. The guard message does not cover this case; the auth error surfaces as-is.
- **CI time:** the `smoke` job gains only the suite's runtime (seconds). No extra `supabase start` is needed.

## Migration Notes

- No schema or data changes.
- Local test rows accumulate until `npx supabase db reset`. CI starts a fresh stack each run.

## References

- Research: `context/changes/testing-rls-visibility-matrix/research.md`
- Test plan: `context/foundation/test-plan.md` §2 risk #2, §3 Phase 1, §6.2
- Policies: `supabase/migrations/20260922120000_roles_and_domain_schema.sql`, `20260923120000_service_entry_loop.sql`, `20260928130000_share_links.sql`, `20260929120000_service_entry_edits.sql`
- Unique-email-per-run pattern: `scripts/smoke.mjs:5-6`
- CI: `.github/workflows/ci.yml:10-55`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: DB test harness and fixtures

#### Automated

- [x] 1.1 `npm run test:db` passes against a running local Supabase (`npx supabase start`)
- [x] 1.2 `npm run test:db` fails with the guidance message when the stack is stopped (`npx supabase stop`)
- [x] 1.3 `npm test` still runs only the 4 existing unit files and passes without Supabase running
- [x] 1.4 `npm run lint` passes
- [x] 1.5 `npx astro check` passes

#### Manual

- [x] 1.6 Running `npm run test:db` twice in a row on the same local DB passes both times (fresh users per run, no collisions)

### Phase 2: RLS visibility matrix

#### Automated

- [ ] 2.1 `npm run test:db` passes with all 30 exact-set cells and all foreign-id checks green
- [ ] 2.2 `npm run lint` passes
- [ ] 2.3 `npx astro check` passes

#### Manual

- [ ] 2.4 Mutation check: an exposing policy turns the suite red
- [ ] 2.5 Mutation check: a hiding policy turns the suite red

### Phase 3: CI gate and test-plan update

#### Automated

- [ ] 3.1 `npm run lint` passes
- [ ] 3.2 `npm test` passes
- [ ] 3.3 `npm run test:db` passes against local Supabase
- [ ] 3.4 `.github/workflows/ci.yml` contains `npm test` in job `ci` and `npm run test:db` in job `smoke`

#### Manual

- [ ] 3.5 A pushed branch or PR shows both CI jobs green, with the `test:db` step output listing the matrix tests
- [ ] 3.6 A throwaway PR that loosens one SELECT policy in a new migration makes the `smoke` job fail at `test:db` (optional but recommended; close the PR afterwards)
- [ ] 3.7 `test-plan.md` §3/§4/§5/§6.2/§6.6 read correctly, and §1/§2 are untouched
