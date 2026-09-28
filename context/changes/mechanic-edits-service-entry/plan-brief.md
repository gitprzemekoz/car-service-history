# Mechanic edits service entry — Plan Brief

> Full plan: `context/changes/mechanic-edits-service-entry/plan.md`

## What & Why

A mechanic can correct a mistake in a service entry they created (PRD FR-006, roadmap S-02). Without this, a wrong cost, date or mileage stays in the client's history for good. The PRD guardrail "Service entries cannot be lost or accidentally overwritten" means an edit must keep the previous version.

## Starting Point

S-01 shipped adding entries (form POST → `parseNewServiceEntry` → insert → redirect) and a shared `ServiceHistory.astro` used by the mechanic and client views. The RLS update policy on `service_entries` already limits updates to the mechanic's own entries for their own clients. There is no `updated_at`, no history and no edit UI.

## Desired End State

Each entry on the mechanic's client page has an "Edit" link that opens a prefilled form on its own page. Saving applies the same validation as adding. The database stores the previous version in `service_entry_revisions`, and both the mechanic and the client see "Edited <date>" on the entry. Another mechanic cannot open or submit the edit.

## Key Decisions Made

| Decision            | Choice                                                     | Why (1 sentence)                                                                          |
| ------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| History integrity   | `BEFORE UPDATE` trigger → append-only revisions table + `updated_at` | Meets the guardrail at the DB level, so no API path can skip it; one migration.        |
| Revisions UI        | None (DB only)                                             | Keeps S-02 small; browsing versions can be a later slice.                                 |
| Edit placement      | Separate SSR page `/dashboard/mechanic/clients/[id]/entries/[entryId]/edit` | Matches the existing SSR + POST/redirect pattern; the shared history component stays simple. |
| Visibility          | "Edited <date>" shown to mechanic and client               | Supports trust in the history; the shared component is changed once.                      |
| Delete              | Out of scope                                               | Not in FR-006, and it conflicts with "cannot be lost".                                    |
| No-op save          | No revision, no "Edited" marker                            | Re-saving an untouched form shouldn't look like a correction.                             |
| Immutable columns   | Trigger rejects changes to `vehicle_id`, `mechanic_id`, `created_at` | RLS alone would allow moving an entry to another of the mechanic's vehicles.       |
| Edit timestamp TZ   | Format in `Europe/Warsaw`                                  | `updated_at` is a timestamp; a UTC date would be off by a day after local midnight.       |

## Scope

**In scope:**
- Migration: `updated_at`, `service_entry_revisions` (RLS on, no policies), trigger
- Shared `ServiceEntryForm` (add + edit), edit page, `POST /api/clients/[id]/entries/[entryId]`
- "Edit" link (mechanic only), "Edited <date>" marker (both views), dev-states fixture

**Out of scope:** deleting entries, revisions UI, editing clients/vehicles, moving entries between vehicles, pgTAP/RLS automated tests, concurrency conflict detection.

## Architecture / Approach

Integrity is enforced by the database trigger, and the app reuses the add flow. The edit page loads the entry through RLS (joined to the client's vehicle) and renders the shared form. The update route runs the add route's checks, validates with `parseNewServiceEntry`, updates only the editable columns with `.select()`, and treats 0 returned rows as "Entry not found", because RLS returns no error. `ServiceHistory.astro` gets an optional `editHref` prop and shows the marker when `updated_at` is set.

## Phases at a Glance

| Phase                          | What it delivers                                     | Key risk                                              |
| ------------------------------ | ---------------------------------------------------- | ----------------------------------------------------- |
| 1. Schema and revision history | Migration + trigger, `ServiceEntry.updated_at`       | Trigger no-op/immutability logic wrong — checked in SQL by hand |
| 2. Edit flow                   | Shared form, edit page, update route, Edit link      | A silent 0-row update misreported as success          |
| 3. "Edited" marker             | `formatEditedDate` + tests, marker in both views     | Day boundary in the time zone — covered by a unit test |

**Prerequisites:** S-01 done (it is); local Supabase stack (`npx supabase start`).
**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- One mechanic = one workshop (F-01), so "entry they created" and "entry of my workshop's client" mean the same thing; RLS checks both.
- Last write wins; concurrent edits aren't handled (single mechanic per workshop).
- RLS and the trigger are verified by hand only, as in S-01.

## Success Criteria (Summary)

- A mechanic fixes a wrong entry in under a minute, and the client sees the corrected values marked "Edited".
- Every real edit leaves the previous version in `service_entry_revisions`; nothing is lost.
- A different mechanic cannot view or change the entry.
