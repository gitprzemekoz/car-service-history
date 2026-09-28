# Mechanic edits service entry Implementation Plan

## Overview

A mechanic can correct a mistake in a service entry they created (PRD FR-006, roadmap S-02). Editing happens on a separate page reached from the client detail page. The database keeps every previous version of the entry in an append-only revisions table, which satisfies the PRD guardrail "Service entries cannot be lost or accidentally overwritten". Both the mechanic's and the client's history show an "Edited <date>" marker on changed entries.

## Current State Analysis

- `service_entries` has no `updated_at` and no history. Its update policy `service_entries_update_mechanic` (`supabase/migrations/20260923120000_service_entry_loop.sql:147-162`) already requires `mechanic_id = auth.uid()`, a client owned by that mechanic, and the mechanic role. The policy has `USING` only, so Postgres applies it to the new row as well. That blocks moving an entry to another mechanic's vehicle, but not to another vehicle of the same mechanic.
- Entries are added through a plain HTML form POST: `src/components/mechanic/AddServiceEntryForm.tsx` → `src/pages/api/clients/[id]/entries.ts` → `parseNewServiceEntry` (`src/lib/validation.ts:94`) → redirect, with errors passed in `?error=`.
- `src/components/ServiceHistory.astro` is shared by the mechanic page (`src/pages/dashboard/mechanic/clients/[id].astro:88`) and the client view (`src/components/ClientDashboardView.astro`).
- `ServiceEntry` fixtures live in `src/lib/service-history.test.ts` and `src/pages/dev/dashboard-states.astro:18`.
- No DB test harness exists (no pgTAP). S-01 checked RLS by hand against the local stack after `npx supabase db reset`.

## Desired End State

On `/dashboard/mechanic/clients/<id>`, each history entry has an "Edit" link to `/dashboard/mechanic/clients/<id>/entries/<entryId>/edit`. That page shows the same form as "Add service entry", prefilled with the entry's values. Saving runs the same validation, updates the entry, and redirects back to the client page. The entry then shows "Edited <date>" in both the mechanic's and the client's history. `service_entry_revisions` holds a snapshot of the entry as it was before each real change. A second mechanic cannot open or submit an edit for the first mechanic's entry.

### Key Discoveries:

- The RLS update policy is already correct for "own entry, own workshop": `supabase/migrations/20260923120000_service_entry_loop.sql:147`.
- A PostgREST update blocked by RLS returns no error and 0 rows. The route must `.select()` the updated row and treat an empty result as "Entry not found".
- The mechanic's Astro routes use `[id].astro` for the client page. A sibling folder `clients/[id]/entries/[entryId]/edit.astro` can live next to it.
- A `.astro` frontmatter must not `return` a Response (see the comment at `src/pages/dashboard/mechanic/clients/[id].astro:33`). Set `Astro.response.status = 404` instead.
- `parseNewServiceEntry` rejects future service dates against `today`. The same rules apply to an edit.

## What We're NOT Doing

- Deleting service entries (no DELETE policy, no UI).
- A UI for browsing previous versions. Revisions are visible only in the database.
- Editing clients or vehicles.
- Moving an entry to another vehicle, or changing `mechanic_id` / `created_at`.
- Automated DB/RLS tests (pgTAP). This follows S-01; RLS is verified by hand.
- Optimistic concurrency / conflict detection. There is one mechanic per workshop, so last write wins.

## Implementation Approach

Integrity lives in the database: a `BEFORE UPDATE` trigger snapshots the old row into `service_entry_revisions` and stamps `updated_at`. No API path can skip it. The app side reuses the add flow: the add form becomes a shared `ServiceEntryForm`, a new SSR edit page loads the entry through RLS, and a new POST route validates with `parseNewServiceEntry` and updates only editable columns. The marker is a small optional block in the shared `ServiceHistory.astro`.

## Critical Implementation Details

- **Trigger semantics**: the trigger compares only the editable columns (`service_type`, `service_date`, `mileage`, `cost`, `notes`, `next_due_mileage`, `next_due_date`). If none changed, it returns `NEW` unchanged: no revision and no `updated_at` bump, so re-saving an untouched form does not mark the entry "Edited". If `vehicle_id`, `mechanic_id` or `created_at` differ from `OLD`, it raises an exception.
- **Timestamp formatting**: `updated_at` is a `timestamptz`, unlike the date-only columns that `formatServiceDate` formats in UTC. Format it in `Europe/Warsaw` so an edit shortly after midnight local time shows the correct day.

## Phase 1: Schema and revision history

### Overview

Add `updated_at`, the revisions table and the trigger, and update the TypeScript row type and its fixtures.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20260928120000_service_entry_edits.sql` (new)

**Intent**: Make edits safe at the database level. Every real change keeps the previous version, and the entry records when it was last edited.

**Contract**:
- `service_entries.updated_at timestamptz null`. Null means never edited, and existing rows stay null.
- Table `service_entry_revisions`: `id uuid pk default gen_random_uuid()`, `service_entry_id uuid not null references service_entries(id) on delete cascade`, snapshot columns matching the editable columns plus `updated_at` of the old row, `revised_at timestamptz not null default now()`, `revised_by uuid references auth.users(id)` (= `auth.uid()`). RLS enabled with **no** policies, so the table can't be reached through the API.
- Function `service_entry_before_update()` (plpgsql, `security definer`, `set search_path = public`) plus trigger `BEFORE UPDATE ON service_entries FOR EACH ROW`. It follows the semantics in Critical Implementation Details: it inserts `OLD`'s editable values into revisions and sets `NEW.updated_at = now()`.
- `revoke execute` on the function from `public, anon, authenticated`. It runs only as a trigger.

#### 2. Row type and fixtures

**File**: `src/lib/types.ts`, `src/lib/service-history.test.ts`, `src/pages/dev/dashboard-states.astro`

**Intent**: Mirror the new column so selects type-check, and keep fixtures valid.

**Contract**: `ServiceEntry.updated_at: string | null`. Existing fixtures get `updated_at: null`.

### Success Criteria:

#### Automated Verification:

- Migrations and seed apply cleanly on a fresh local stack: `npx supabase db reset`
- Production build succeeds: `npm run build`
- Lint passes: `npm run lint`
- Unit tests pass: `npm test`

#### Manual Verification:

- In Supabase Studio SQL (local), updating the seeded entry's `notes` creates one `service_entry_revisions` row with the old notes and sets `updated_at`. Repeating the update with the same value creates no new row.
- Updating the seeded entry's `vehicle_id` or `mechanic_id` raises an error.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Edit flow

### Overview

The mechanic can open an entry in an edit form, save it, and return to the client page.

### Changes Required:

#### 1. Shared form

**File**: `src/components/mechanic/ServiceEntryForm.tsx` (renamed from `AddServiceEntryForm.tsx`), `src/pages/dashboard/mechanic/clients/[id].astro`

**Intent**: One form for add and edit, so both keep the same fields and client-side required checks.

**Contract**: Props `action: string`, `initialValues: Record<Field, string>`, `submitLabel: string`, `pendingText: string`, `serverError?: string | null`. The add usage passes today's date as the initial `serviceDate` and empty values for the rest, with `action` set to `/api/clients/<id>/entries`. Behavior of the add form is unchanged.

#### 2. Update route

**File**: `src/pages/api/clients/[id]/entries/[entryId].ts` (new)

**Intent**: Validate and apply an edit, following the add route's structure (session check → Supabase config → mechanic role check → RLS-scoped lookup → parse → write → redirect).

**Contract**: `POST /api/clients/:id/entries/:entryId`, form fields `SERVICE_ENTRY_FIELDS`.
- The entry must belong to the vehicle of client `:id` (RLS-scoped select). If not found, redirect to `/dashboard/mechanic?error=Entry not found`.
- If validation fails (`parseNewServiceEntry(form, new Date())`), redirect to the edit page with `?error=`.
- Update only the editable columns, with `.eq("id", entryId).select("id")`. An error, or 0 rows returned, redirects to the edit page with `?error=` ("Entry not found" for 0 rows).
- On success, redirect to `/dashboard/mechanic/clients/:id`.

#### 3. Edit page

**File**: `src/pages/dashboard/mechanic/clients/[id]/entries/[entryId]/edit.astro` (new)

**Intent**: SSR page that loads the entry through RLS and renders the prefilled shared form. Its layout matches the client page (back link, card section).

**Contract**: It loads the entry with `service_entries` joined to `vehicles!inner(client_id)`, filtered by `id = entryId` and `vehicles.client_id = id`. If there's no row, it shows 404 "Entry not found" using the client page's not-found block pattern. It maps DB values to form strings (null → `""`, numbers → `String`), and passes `?error=` into `serverError`. Submit label "Save changes", pending text "Saving...".

#### 4. Edit link on the mechanic's history

**File**: `src/components/ServiceHistory.astro`, `src/pages/dashboard/mechanic/clients/[id].astro`

**Intent**: The mechanic reaches the edit page from each entry. The client view shows no link.

**Contract**: Optional prop `editHref?: (entry: ServiceEntry) => string`. When set, each entry shows an "Edit" link (text-primary, underline on hover, like the existing back links). Only the mechanic page passes it. `ClientDashboardView.astro` is unchanged.

### Success Criteria:

#### Automated Verification:

- Production build succeeds: `npm run build`
- Lint passes: `npm run lint`
- Unit tests pass: `npm test`

#### Manual Verification:

- As `mechanic@example.test`, clicking "Edit" on the seeded entry opens a form prefilled with all its values. Changing cost and notes and saving returns to the client page with the new values.
- Submitting the edit form with an invalid value (e.g. future service date) returns to the edit page with the server error shown and the entry unchanged.
- Adding a new entry still works exactly as before.
- A second mechanic (sign up with a new email) opening the first mechanic's edit URL gets "Entry not found". POSTing to the update route leaves the entry unchanged.
- The client (`client@example.test`) sees the updated values on `/dashboard` and no "Edit" link.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: "Edited" marker

### Overview

Edited entries show "Edited <date>" in both views, and the dev states page covers that state.

### Changes Required:

#### 1. Formatter

**File**: `src/lib/service-history.ts`, `src/lib/service-history.test.ts`

**Intent**: Format an edit timestamp as a Polish calendar date in the workshop's time zone.

**Contract**: `formatEditedDate(timestamp: string): string`, `pl-PL`, `timeZone: "Europe/Warsaw"`, same day/month/year style as `formatServiceDate`. Tests: a normal timestamp, and `2026-09-27T22:30:00Z` → `"28 wrz 2026"` (Warsaw is UTC+2).

#### 2. Marker in shared history

**File**: `src/components/ServiceHistory.astro`

**Intent**: Show that an entry was corrected, in both mechanic and client views.

**Contract**: When `entry.updated_at !== null`, show `Edited <formatEditedDate(updated_at)>` as small muted text in the entry. Nothing shows for never-edited entries.

#### 3. Dev states

**File**: `src/pages/dev/dashboard-states.astro`

**Intent**: Make the edited state reviewable without a DB.

**Contract**: One fixture entry in state (a) gets a non-null `updated_at`, and its label mentions the marker.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the new `formatEditedDate` cases: `npm test`
- Production build succeeds: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- After the Phase 2 edit, the entry shows "Edited <today>" for both the mechanic and the client. Never-edited entries show no marker.
- `/dev/dashboard-states` shows the marker on the edited fixture at 1280px and 375px without layout breakage.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `formatEditedDate`: normal case and the UTC/Warsaw day-boundary case.
- Existing `parseNewServiceEntry` tests cover edit validation, since the edit reuses the same parser.

### Integration Tests:

- None automated (no DB test harness). The trigger and RLS are verified by hand against the local stack.

### Manual Testing Steps:

1. `npx supabase db reset`, `npm run dev`.
2. As `mechanic@example.test`, edit the seeded entry (cost + notes) → values updated, "Edited <today>" shown.
3. In Studio: `select * from service_entry_revisions` → one row with the old values.
4. Save the edit form without changes → no new revision row.
5. Submit a future service date → error shown, entry unchanged.
6. Sign up `mechanic2@example.test` → open the first mechanic's edit URL → "Entry not found".
7. As `client@example.test` → updated values and marker, no "Edit" link.

## Performance Considerations

None. One extra insert per edit, at MVP scale.

## Migration Notes

The migration only adds a nullable column, a new table and a trigger, so it is safe on existing rows. Existing entries have `updated_at = null` and no revisions. `seed.sql` needs no change.

## References

- PRD: `context/foundation/prd.md` (FR-006, Guardrails)
- Roadmap: `context/foundation/roadmap.md` (S-02)
- Similar implementation: `src/pages/api/clients/[id]/entries.ts`, `src/components/mechanic/AddServiceEntryForm.tsx`
- RLS: `supabase/migrations/20260923120000_service_entry_loop.sql:147`
- Prior change: `context/archive/2026-09-23-first-service-entry-visible-to-client/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema and revision history

#### Automated

- [x] 1.1 Migrations and seed apply cleanly on a fresh local stack: `npx supabase db reset`
- [x] 1.2 Production build succeeds: `npm run build`
- [x] 1.3 Lint passes: `npm run lint`
- [x] 1.4 Unit tests pass: `npm test`

#### Manual

- [x] 1.5 Updating the seeded entry's notes creates one revision row and sets updated_at; a same-value update creates none
- [x] 1.6 Updating the seeded entry's vehicle_id or mechanic_id raises an error

### Phase 2: Edit flow

#### Automated

- [ ] 2.1 Production build succeeds: `npm run build`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Unit tests pass: `npm test`

#### Manual

- [ ] 2.4 Mechanic edits the seeded entry via a prefilled form and sees the new values
- [ ] 2.5 Invalid edit returns to the edit page with the server error and the entry unchanged
- [ ] 2.6 Adding a new entry still works exactly as before
- [ ] 2.7 A second mechanic gets "Entry not found" and cannot change the entry via POST
- [ ] 2.8 The client sees updated values and no "Edit" link

### Phase 3: "Edited" marker

#### Automated

- [ ] 3.1 Unit tests pass, including the new `formatEditedDate` cases: `npm test`
- [ ] 3.2 Production build succeeds: `npm run build`
- [ ] 3.3 Lint passes: `npm run lint`

#### Manual

- [ ] 3.4 Edited entry shows "Edited <today>" for mechanic and client; never-edited entries show no marker
- [ ] 3.5 `/dev/dashboard-states` shows the marker at 1280px and 375px without layout breakage
