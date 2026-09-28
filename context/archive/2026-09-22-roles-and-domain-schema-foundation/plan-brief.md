# Roles and Domain Schema Foundation — Plan Brief

> Full plan: `context/changes/roles-and-domain-schema-foundation/plan.md`

## What & Why

Give registered users a mechanic/client role, create the minimal domain schema (`clients`, `vehicles`, `service_entries`), and enforce the PRD's privacy guardrail with Postgres RLS — before any domain CRUD UI exists. This is the roadmap's F-01 foundation: everything downstream (S-01 through S-05) needs the role distinction and the RLS boundary this establishes, and a mistake here would violate the privacy guardrail across every later slice.

## Starting Point

Auth already works (signin/signup/signout, `src/middleware.ts`) but has zero role concept — signup only calls `supabase.auth.signUp`, and the middleware gates purely on "logged in or not." There is exactly one dashboard route (`src/pages/dashboard.astro`) and no Supabase migrations, RLS policies, or domain tables exist anywhere in the repo yet.

## Desired End State

A `profiles` table tags every user as `'mechanic'` or `'client'`, auto-assigned on signup. `clients`/`vehicles`/`service_entries` tables exist with RLS so a mechanic sees only their own workshop's data and a client sees only their own vehicle. `/dashboard` serves clients; a new `/dashboard/mechanic` serves mechanics, with each role redirected off the other's route.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Workshop scoping | One mechanic = one workshop, no separate `workshops` table | Matches MVP scale and the roadmap's suggested default; avoids an entity the PRD never asked for | Plan |
| Role storage | New `profiles` table, 1:1 with `auth.users` | Queryable/joinable from RLS policies and app code with plain SQL | Plan |
| Client account creation | Mechanic creates a `clients` row first (no auth account); client later signs up and is linked by matching email | Matches FR-001's "mechanic adds client" flow and the PRD Non-Goal against client self-registration | Plan |
| Unclaimed client rows | `clients.user_id` nullable, filled in by a signup trigger | Lets a mechanic add a client before that client has ever signed up | Plan |
| Dashboard routing | `/dashboard` stays client-facing; new `/dashboard/mechanic` added; each role redirected off the other | Preserves the existing `/dashboard` URL and its middleware entry | Plan |
| RLS verification | Manual, via seeded rows + Supabase Studio | No pgTAP/test-DB convention exists yet; overkill for a schema-only foundation with no CRUD | Plan |
| Seed data | Add minimal `supabase/seed.sql` (one mechanic, one client, one vehicle, one entry) | Fills a gap already referenced by `supabase/config.toml` and unblocks manual RLS verification | Plan |

## Scope

**In scope:** `profiles`/`clients`/`vehicles`/`service_entries` tables + RLS, a signup trigger assigning roles, `supabase/seed.sql`, `App.Locals`/middleware role plumbing, a new role-gated `/dashboard/mechanic` route, and updating three docs that currently claim "no migrations needed."

**Out of scope:** Domain CRUD UI/API (S-01), a separate `workshops` entity, mechanic-invited/email-invite client account creation, automated RLS test tooling, pushing the migration to a remote/production Supabase project, and reconciling a client who signs up with a different email than the mechanic entered.

## Architecture / Approach

One additive Postgres migration establishes the schema and RLS boundary at the database layer first; a `security definer` trigger on `auth.users` assigns roles and links pending client rows at signup time, so no application code needs to write role data. The app layer then just reads `profiles.role` in middleware and uses it to render/gate the two dashboard routes — no new write paths are added to the app in this change.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. DB schema, RLS, trigger, seed | The full privacy boundary, enforced at the database level | Getting the RLS join chain (vehicle → client → mechanic) wrong would leak data across workshops |
| 2. Role plumbing in middleware/types | `Astro.locals.profile.role` available app-wide | None significant — straightforward read-through |
| 3. Role-gated dashboard routes | `/dashboard` (client) and `/dashboard/mechanic`, each redirecting the other role away | Redirect loop if both conditions fire on the same request — needs the exact-pathname check named in the plan |

**Prerequisites:** Local Supabase stack running (`context/changes/local-supabase-setup/plan.md`); no remote Supabase project required for this change.
**Estimated effort:** ~1 session across 3 phases — schema-only foundation, no UI/CRUD work.

## Open Risks & Assumptions

- Assumes "one mechanic = one workshop" holds for the life of the MVP; revisiting it later means a schema migration (adding a `workshops` table and re-pointing `clients.mechanic_id`).
- Assumes the client always signs up with the exact email the mechanic entered; a mismatch leaves the `clients` row permanently unclaimed (accepted as out of scope).
- Pushing this migration to a real/production Supabase project has no automated path yet in this repo — a future infra/deploy change will need to add one.

## Success Criteria (Summary)

- A mechanic and a client, each in their own seeded session, see only their own workshop's/vehicle's data when queried directly against Postgres (RLS holds).
- Each role lands on and is confined to its own dashboard route (`/dashboard` for clients, `/dashboard/mechanic` for mechanics), with signed-out access still blocked.
- No domain CRUD exists yet — this change ships schema and route gating only, setting up S-01 to build on top of it.
