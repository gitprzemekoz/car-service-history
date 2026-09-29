<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Shareable Vehicle History Link

- **Plan**: context/changes/shareable-vehicle-history-link/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 6 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Concurrent create requests surface a raw unique-violation error

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260928130000_share_links.sql:98-111, src/pages/api/share-link/index.ts:18-20
- **Detail**: The trigger is two `create_share_link()` calls at once for the same vehicle, for example a double-click on "Create new link" or two open tabs. Under READ COMMITTED, T2's DELETE waits on T1's row lock. After T1 commits, T2 deletes nothing, and its INSERT hits T1's new row on `share_links_vehicle_id_key` (23505). The route passes `error.message` through, so the card shows `duplicate key value violates unique constraint "share_links_vehicle_id_key"`. The data stays consistent, but the comment at lines 75-77 ("a vehicle never has two links") hides the fact that the second request fails.
- **Fix A ⭐ Recommended**: In a new migration, serialize inside the function by locking the caller's vehicle row (`select … from vehicles … for update`) before the delete.
  - Strength: Fixes the cause at the database boundary the plan designates. Both requests succeed, and the last one wins.
  - Tradeoff: Needs a new migration, because the existing one is already applied. Under `security invoker`, `for update` on vehicles needs an UPDATE privilege or policy, or an advisory lock instead (`pg_advisory_xact_lock(hashtext(v_vehicle_id::text))`).
  - Confidence: MED. The advisory-lock variant sidesteps RLS on vehicles. The `for update` variant needs checking against the vehicles policies.
  - Blind spot: Not reproduced under real concurrency; the analysis comes from Postgres READ COMMITTED semantics.
- **Fix B**: In `src/pages/api/share-link/index.ts`, map `error.code === "23505"` to a plain redirect to `/dashboard`, since a link exists either way.
  - Strength: One-line change that matches `src/pages/api/clients/index.ts` (`UNIQUE_VIOLATION` mapping). No migration needed.
  - Tradeoff: The second request quietly keeps the first request's token instead of issuing a fresh one.
  - Confidence: HIGH. The pattern already exists in the repo.
  - Blind spot: None significant.
- **Decision**: PENDING

### F2 — Share-link routes skip the profile-role guard used by other POST routes

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/share-link/index.ts:10, src/pages/api/share-link/revoke.ts
- **Detail**: `clients/index.ts:73-78` and `entries.ts:19-24` both check `profiles.role` before writing. The middleware doesn't load profiles for `/api/*`. The new routes rely only on RLS and the RPC. That is secure, since the policies require `role = 'client'`, and the plan made the check optional. The effect: a mechanic's create request redirects to `/dashboard?error=…`, and the middleware then forwards to `/dashboard/mechanic`, dropping the message. A mechanic's revoke is a silent no-op.
- **Fix**: Add the same `profile?.role !== "client"` → `redirect("/dashboard")` guard to both routes, or add a one-line comment saying it is omitted on purpose.
- **Decision**: PENDING

### F3 — Raw database error text reflected into the dashboard

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/share-link/index.ts:19, src/pages/api/share-link/revoke.ts:17-18, src/pages/dashboard.astro:41
- **Detail**: `error.message` (RAISE text, constraint names, RLS messages) goes verbatim into `?error=` and is rendered in the card's `role="alert"`. This matches `entries.ts:50-51`. Separately, any crafted `/dashboard?error=<text>` link shows text of the attacker's choosing inside an authenticated page. It is escaped, so not XSS, and the auth pages share the same pattern.
- **Fix**: Map the expected cases (no vehicle, 23505) to fixed strings and fall back to a generic "Could not update the share link".
- **Decision**: PENDING

### F4 — share_links query error silently renders "no link"

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:36-39
- **Detail**: Only `data` is destructured, so a failed `share_links` select shows the "Create share link" state. That hides an active link that is still live and publicly readable, and invites the client to create a new one. It fails safe for the database, but misleads about what is currently shared.
- **Fix**: Destructure `error` and pass a share-card error, for example "Could not load your share link", instead of treating the failure as no link.
- **Decision**: PENDING

### F5 — Migration hardening nits (search_path, non-strict select, created_by FK)

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260928130000_share_links.sql:15, :89-92, :153
- **Detail**: Three small items:
  - `get_shared_vehicle_history` is `security definer`, granted to anon, with `set search_path = public`. The hardened form is `public, pg_temp`. It is not exploitable via PostgREST and matches `handle_new_user`.
  - `select … into v_vehicle_id` is not STRICT. It relies on the one-vehicle-per-client invariant without failing loudly if that ever changes.
  - `created_by … references auth.users(id)` has no `on delete` clause, so deleting a user with a live link fails. `clients.user_id` behaves the same way.
- **Fix**: If you decide to do these, fold them into the same new migration as F1 Fix A: `pg_temp` in the search_path, `into strict`, and `on delete cascade` on `created_by`.
- **Decision**: PENDING

### F6 — ShareLink type omits id and created_by

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/types.ts:38-43
- **Detail**: The file header says row types mirror database columns, and Client, Vehicle and ServiceEntry are complete. `ShareLink` follows the plan's contract exactly but leaves out `id` and `created_by`.
- **Fix**: Add `id: string` and `created_by: string`. Consumers already use `Pick<>`, so nothing else changes.
- **Decision**: PENDING

### F7 — Smoke step change and minor extras are outside the plan text

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: scripts/smoke.mjs:58-64, supabase/migrations/20260928130000_share_links.sql:44, :126
- **Detail**: These extras are all harmless:
  - During Phase 3, the user approved replacing "dashboard renders for signed-in user" with a mechanic-redirect step and a mechanic-dashboard step, because fresh signups become mechanics.
  - The insert policy also requires `created_by = auth.uid()` (stricter than planned).
  - `revoke_share_link` sets a `search_path`.
  - There are extra unit tests.
  - The migration timestamp is `130000`, not `120000`.
- **Fix**: Note these in `change.md` Notes so the plan stays the source of truth for archive.
- **Decision**: PENDING

### F8 — Dashboard makes a second sequential round trip for the share link

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:36-39
- **Detail**: `share_links` is fetched after the clients/vehicles query. It could be embedded (`vehicles(…, service_entries(*), share_links(token, expires_at))`). The cost is one extra indexed query per dashboard load.
- **Fix**: Embed `share_links(token, expires_at)` in the existing select, or leave as is.
- **Decision**: PENDING
