# First Service Entry Visible to Client — Plan Brief

> Full plan: `context/changes/first-service-entry-visible-to-client/plan.md`

## What & Why

Deliver the PRD's Primary Success Criterion (US-01, FR-001–FR-004): a mechanic adds a client with their vehicle and a service entry, sees entries only for their own clients, and the client logs in and sees that vehicle and history. This is the roadmap's north star (S-01) — every later slice builds on this loop.

## Starting Point

F-01 shipped roles, the `clients` / `vehicles` / `service_entries` schema with RLS, the signup trigger that links a client by email, and role-gated but empty `/dashboard` and `/dashboard/mechanic` pages. No domain API or UI exists; the only form pattern is the auth forms (React form → API route → redirect with `?error=`).

## Desired End State

A mechanic manages a client list at `/dashboard/mechanic`, adds clients with a vehicle in one step, and records service entries on `/dashboard/mechanic/clients/[id]`. A client who signs up with the entered email sees their vehicle and full history (newest first, including cost) on `/dashboard`. The database blocks non-mechanic writes, duplicate/case-mismatched emails, and a second vehicle per client.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Odometer mileage | New required `service_entries.mileage` | PRD Business Logic (S-05 reminders) consumes the last entry's mileage. |
| Email matching | Lowercase check + unique `clients.email`; trigger compares `lower(new.email)` | A case mismatch would otherwise turn the client into a mechanic at signup. |
| Client + vehicle creation | `security invoker` RPC `create_client_with_vehicle` | One transaction, no orphan clients, RLS still decides access. |
| Vehicle data | make + model + required `registration_number` | Mechanics identify cars by plate; VIN/year exceed FR-001. |
| Mechanic UI | List page + per-client detail page | One purpose per page; detail page is where S-02 editing will land. |
| Client view | Vehicle card + full history, newest first, with cost | Meets US-01 fields; the client persona wants to see costs. |
| Testing | Vitest for pure validators; RLS verified manually | Matches existing Vitest setup and F-01's manual RLS convention. |
| RLS role gap (found in research) | Insert/update policies also require `role = 'mechanic'` | Today a client could insert a `clients` row naming themselves as mechanic. |
| Entry validation | Date not in future; mileage/cost ≥ 0; at least one next-due value greater than current | FR-002 requires the next-service interval with every entry. |
| One vehicle per client | Unique index on `vehicles(client_id)` | PRD Non-Goal: exactly one vehicle per client in MVP. |

## Scope

**In scope:** follow-up migration (columns, constraints, RLS role checks, RPC, trigger fix) + seed update; domain types and validators with unit tests; `POST /api/clients` and `POST /api/clients/[id]/entries`; mechanic list/add-client page, client detail/add-entry page, shared history component; client dashboard.

**Out of scope:** editing entries (S-02), share links (S-03), flags (S-04), reminders/email (S-05), client invite emails, editing/deleting clients or vehicles, multi-vehicle, pagination/search, pgTAP RLS tests, remote `db push`, handling a person who signs up before the mechanic adds them.

## Architecture / Approach

Database first: a second additive migration makes the schema safe for write paths; a `security invoker` RPC creates client + vehicle atomically under RLS. Pure TS validators turn `FormData` into typed inputs; thin Astro API routes check the mechanic role, validate, write via Supabase, and redirect with `?error=` like the auth routes. Pages render server-side with RLS-scoped selects; a shared `ServiceHistory` component serves both roles.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema follow-up migration + seed | Safe, complete schema and atomic RPC | New `not null` columns break `db reset` if seed isn't updated alongside |
| 2. Types + validators | Tested input rules | Rules drifting from the form fields in Phase 3 |
| 3. Mechanic side | Add client, add entry, mechanic-scoped history | API routes lack `locals.profile`; must check role explicitly |
| 4. Client side | Client sees vehicle and history | Relies on signup email matching — verified end-to-end here |

**Prerequisites:** F-01 archived (done); local Supabase stack running.
**Estimated effort:** ~2 sessions across 4 phases.

## Open Risks & Assumptions

- A person who signs up before the mechanic adds them becomes a mechanic (F-01 trigger behavior) — accepted for MVP.
- The client learns to sign up out-of-band (mechanic tells them); no invite email.
- `not null` columns without defaults assume no remote project holds F-01 data yet.

## Success Criteria (Summary)

- A mechanic adds a client + vehicle + entry, and the client, after signing up with that email, sees them on `/dashboard` without any sync step.
- Mechanics see only their own clients; clients see only their own vehicle; non-mechanics cannot write domain data.
- Invalid or duplicate input is rejected with a readable error and writes nothing.
