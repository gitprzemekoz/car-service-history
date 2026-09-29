<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Mechanic edits service entry

- **Plan**: context/changes/mechanic-edits-service-entry/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-28
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Success Criteria note: `npm test` (36/36), `npm run build` and `npm run lint` were re-run and pass. `npx supabase db reset` (1.1) was not re-run, because the local Supabase stack is shared with the `ai-shareable-vehicle-history-link` worktree and a reset would drop its `share_links` migration. The migration was applied cleanly on its own during Phase 3 verification. All manual rows are `[x]` and were confirmed by the user.

## Findings

### F1 — Trigger lets a caller forge or clear updated_at

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260929120000_service_entry_edits.sql:53-61
- **Detail**: The no-op branch returns the caller's `NEW` unchanged, including `NEW.updated_at`. The owning mechanic can send a direct PostgREST request (`PATCH service_entries?id=eq.X {"updated_at": null}`) that passes RLS and the immutability check. It creates no revision and clears the "Edited" marker, which hides a correction from the client. The same request can set `updated_at` to any timestamp. `id` is also not in the immutable list.
- **Fix A ⭐ Recommended**: Edit the unmerged migration in place. Set `new.updated_at := old.updated_at;` before the no-op `return new;`, and add `id` to the immutable-column check. Then re-apply the function locally with `create or replace`.
  - Strength: The branch is not merged or deployed, so one clean migration keeps the history readable. It is a two-line change.
  - Tradeoff: Every local DB that already applied the migration must re-run the function definition, or be reset.
  - Confidence: HIGH — verified by reading the trigger body.
  - Blind spot: Not verified whether this migration was already pushed to a remote or preview Supabase project.
- **Fix B**: Add a new follow-up migration that runs `create or replace function service_entry_before_update()` with the fix.
  - Strength: Safe even if the migration has already been applied somewhere remote.
  - Tradeoff: An extra migration file for a fix to code that never shipped.
  - Confidence: HIGH — standard forward-only migration practice.
  - Blind spot: None significant.
- **Decision**: PENDING

### F2 — Revisions table relies only on "RLS with no policies" and has no FK index

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260929120000_service_entry_edits.sql:16-31
- **Detail**: `service_entry_revisions` keeps Supabase's default grants to `anon` and `authenticated`. Only RLS with no policies blocks access, so adding any policy later would expose the table. `service_entry_id` also has no index, which cascade deletes and any future history lookups will need.
- **Fix**: Add `revoke all on service_entry_revisions from anon, authenticated;` and `create index on service_entry_revisions (service_entry_id);`.
- **Decision**: PENDING

### F3 — Revision history cascades away with its entry

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260929120000_service_entry_edits.sql:18
- **Detail**: `on delete cascade` removes an entry's revisions when the entry is deleted, and entries in turn cascade from vehicles and clients. No DELETE policy exists today, so only the service role can trigger this. The plan specified the cascade.
- **Fix**: Keep the cascade (deletion is out of scope) and revisit it when a delete flow is planned.
- **Decision**: PENDING

### F4 — 0-rows update redirects to a page that cannot show the error

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/clients/[id]/entries/[entryId].ts:65-66
- **Detail**: When the update returns 0 rows, the route redirects to the edit page with `?error=Entry not found`. The entry is unreadable in that case, so the edit page renders its 404 block and never shows `error`. The pre-check at line 35 sends the same case to `/dashboard/mechanic?error=`. The plan specified this redirect, so this is a flaw in the plan. The user still sees "Entry not found".
- **Fix**: Redirect the 0-rows case to `/dashboard/mechanic?error=Entry not found`, as the pre-check does.
- **Decision**: PENDING

### F5 — The marker check throws when updated_at is missing

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/ServiceHistory.astro:46
- **Detail**: The check `entry.updated_at !== null` calls `formatEditedDate(undefined)` if a row has no `updated_at` key. That throws a `RangeError` during SSR and renders a blank 200 page. This happened during Phase 3 verification, when the shared local DB lacked the migration. Today both callers select `service_entries(*)`, so the column is always present once the migration is applied.
- **Fix**: Change the check to `entry.updated_at != null`.
- **Decision**: PENDING

### F6 — "Save changes" button shows the Plus icon

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/mechanic/ServiceEntryForm.tsx:150
- **Detail**: The shared form always renders the `Plus` icon, which makes sense for "Add service entry" but not for "Save changes". This is cosmetic; the plan didn't specify an icon.
- **Fix**: Add an optional icon prop, or render the icon only for the add usage.
- **Decision**: PENDING
