# Roles and Domain Schema Foundation Implementation Plan

## Overview

Add a mechanic/client role distinction to registered users, create the minimal domain schema (`clients`, `vehicles`, `service_entries`) with Postgres RLS enforcing the PRD's privacy guardrail, and gate two dashboard routes by role. This is a schema + auth-plumbing foundation — no domain CRUD UI/API is built here (that's S-01's job).

## Current State Analysis

- Auth exists (`src/pages/api/auth/{signin,signup,signout}.ts`, `src/middleware.ts`) but has zero role concept. `src/pages/api/auth/signup.ts:13` calls `supabase.auth.signUp({ email, password })` with no metadata; nothing else is written on signup.
- `src/middleware.ts:1-25` sets `context.locals.user` from `supabase.auth.getUser()` and gates only `PROTECTED_ROUTES = ["/dashboard"]` on "logged in or not" — no role check exists.
- `src/env.d.ts:1-5` types `App.Locals.user` as the raw Supabase `User`; no `role`/`profile` field.
- Only one dashboard route exists: `src/pages/dashboard.astro:1-28`, a single view for every logged-in user.
- No Supabase migrations exist yet (`supabase/migrations/` doesn't exist on disk). `supabase/config.toml:36` pins Postgres `major_version = 17`. `supabase/config.toml:65` already references a `./seed.sql` that doesn't exist.
- No RLS policies, triggers, or domain tables exist anywhere in the repo — a repo-wide grep for `auth.users`, `CREATE POLICY`, `CREATE TRIGGER`, `security definer` found no SQL, only prose mentions in `README.md:115`, `context/changes/deployment/deployment-plan.md:33`, and `context/changes/local-supabase-setup/plan.md:61` — all three currently assert "no migrations/tables needed," which this change invalidates.
- CI (`.github/workflows/ci.yml`) runs a local ephemeral Supabase stack for the `smoke` job (`supabase start` at line 41), which auto-applies anything in `supabase/migrations/` — no code change needed there. There is no `supabase db push` step against a remote project anywhere in the repo; pushing this migration to a real/remote Supabase project is a manual step, out of scope here (see What We're NOT Doing).

## Desired End State

A `profiles` table (1:1 with `auth.users`) carries a `role` of `'mechanic'` or `'client'`, auto-populated by a trigger on signup. `clients`, `vehicles`, and `service_entries` tables exist with RLS enforcing: a mechanic sees only clients/vehicles/entries they created (one mechanic = one workshop for MVP scale); a client sees only their own vehicle and its entries. `/dashboard` renders the client view; a new `/dashboard/mechanic` route exists and is gated so only mechanics can reach it (and mechanics visiting `/dashboard` are redirected there).

**Verification:** Run `npx supabase start` locally, apply the seeded data, and in Supabase Studio (`http://localhost:54323`) run one query as each seeded role (or via the `anon` client with a role's JWT) confirming the mechanic can see their own seeded client/vehicle/entry but not any other workshop's, and the client can see only their own vehicle/entry.

### Key Discoveries:

- No existing SQL convention to follow (`supabase/migrations/` is empty/absent) — this migration establishes the convention from scratch.
- `auth.users` has no pre-existing triggers/functions to conflict with — safe to add `on_auth_user_created`.
- Postgres 17 is confirmed (`supabase/config.toml:36`), so `security definer` functions, `auth.uid()`, and standard `AFTER INSERT ON auth.users` triggers are all available.
- Path alias `@/*` → `./src/*` (`tsconfig.json:9-11`) is available for any new shared types module.
- No `src/types/` directory exists yet — this change introduces one (`src/lib/types.ts`) for the `Role` type, since none of the three roadmap-listed tables have a prior home.

## What We're NOT Doing

- No domain CRUD UI or API (no create/edit forms, no `/api/clients`, `/api/vehicles`, `/api/service-entries` routes) — that's S-01.
- No separate `workshops` entity — one mechanic account is scoped as its own workshop for MVP; revisit only if multiple mechanics per workshop becomes a real requirement.
- No mechanic-invited account creation / email-invite flow for clients — clients get a `clients` row from the mechanic first, and self-link their `auth.users` account on signup by matching email.
- No automated RLS test suite (pgTAP or similar) — verification here is manual via seeded data and Supabase Studio, consistent with this being a schema-only foundation with no CRUD yet.
- No CI/CD step to push this migration to a remote/production Supabase project — `supabase/migrations/` is picked up automatically by the existing local `supabase start` smoke job, but deploying to a real environment is a manual step left for a later infra/deploy change.
- No handling for a client signing up with a different email than the one the mechanic entered for them — the row simply stays unclaimed; reconciling that is out of scope.

## Implementation Approach

Ship the database layer first (Phase 1: migration with tables, RLS, trigger, seed data), then thread the role through the app (Phase 2: types + middleware read the new `profiles.role`), then split the dashboard route by role (Phase 3). Each phase is independently verifiable before the next begins, since Phase 2 and 3 both depend on Phase 1's schema existing.

## Phase 1: Database schema, RLS, and role-assignment trigger

### Overview

Create the first Supabase migration: `profiles`, `clients`, `vehicles`, `service_entries` tables; RLS policies scoping every table by the authenticated user; a `security definer` trigger on `auth.users` that creates the matching `profiles` row and links any pending `clients` row by email. Add `supabase/seed.sql` with one seeded mechanic, one seeded (already-linked) client, one vehicle, and one service entry, for manual RLS verification. Update the three docs that currently assert "no migrations needed."

### Changes Required:

#### 1. Migration file

**File**: `supabase/migrations/<timestamp>_roles_and_domain_schema.sql` (timestamp via `npx supabase migration new roles_and_domain_schema`)

**Intent**: Define the full domain schema and its privacy boundary in one migration: role storage, the three domain tables, and RLS enforcing the PRD's NFR ("a client's vehicle data and service history are visible only to that client, their assigned service/mechanic, and holders of a valid share link").

**Contract**:
- `role` — a Postgres enum type with values `'mechanic'`, `'client'`.
- `profiles(id uuid primary key references auth.users(id) on delete cascade, role role not null, created_at timestamptz not null default now())`.
- `clients(id uuid primary key default gen_random_uuid(), mechanic_id uuid not null references profiles(id), user_id uuid references auth.users(id), name text not null, email text not null, created_at timestamptz not null default now())`. `user_id` is nullable (a client added by a mechanic has no auth account yet) and gets filled in by the signup trigger once a matching email signs up.
- `vehicles(id uuid primary key default gen_random_uuid(), client_id uuid not null references clients(id) on delete cascade, make text not null, model text not null, created_at timestamptz not null default now())` — minimal columns; richer vehicle fields are S-01's concern if the PRD's FR-001 needs more, but F-01 only needs enough columns to prove the FK/RLS chain.
- `service_entries(id uuid primary key default gen_random_uuid(), vehicle_id uuid not null references vehicles(id) on delete cascade, mechanic_id uuid not null references profiles(id), service_type text not null, service_date date not null, cost numeric, notes text, next_due_mileage integer, next_due_date date, created_at timestamptz not null default now())`.
- RLS enabled on all four tables (`enable row level security`).
  - `profiles`: a user can `select`/`update` only their own row (`id = auth.uid()`).
  - `clients`: mechanics can `select`/`insert`/`update` rows where `mechanic_id = auth.uid()`; clients can `select` the single row where `user_id = auth.uid()`.
  - `vehicles`: mechanics can access vehicles whose `client_id` belongs to a `clients` row with `mechanic_id = auth.uid()`; clients can `select` vehicles whose `client_id` belongs to their own linked `clients` row.
  - `service_entries`: same join-through-vehicle-through-client scoping as `vehicles`, for both roles; only the creating mechanic (`mechanic_id = auth.uid()`) may `insert`/`update`.
- Trigger function `handle_new_user()` (`security definer`, `search_path = public`), fired `after insert on auth.users for each row`: looks for an unclaimed `clients` row (`user_id is null`) matching `new.email`; if found, sets that row's `user_id = new.id` and inserts a `profiles` row with `role = 'client'`; otherwise inserts a `profiles` row with `role = 'mechanic'` (a self-registering mechanic is treated as a new workshop owner, matching the "one mechanic = one workshop" decision).

#### 2. Seed data

**File**: `supabase/seed.sql`

**Intent**: Populate enough rows to manually verify RLS as each role without hand-writing SQL first. `supabase/config.toml:65` already expects this file at reset time; it's currently missing.

**Contract**: Insert one `auth.users` row for a mechanic (triggers `handle_new_user` → mechanic profile), one `clients` row owned by that mechanic with a known email, one `auth.users` row for that same email (triggers linking → client profile + `user_id` filled), one `vehicles` row under that client, one `service_entries` row under that vehicle. Use fixed, documented emails/passwords (e.g. `mechanic@example.test` / `client@example.test`) so manual verification steps in Success Criteria can reference them directly.

#### 3. Documentation updates

**Files**: `README.md:115`, `context/changes/deployment/deployment-plan.md:33`, `context/changes/local-supabase-setup/plan.md:61`

**Intent**: These three currently state the project "uses Supabase Auth's built-in `auth.users` table only" / "no migrations needed" — false once this migration lands. Update each to note that `supabase/migrations/` now contains the roles/domain schema and that `supabase start` (local) or a future manual `supabase db push` (remote) applies it.

**Contract**: Prose-only edits to the named lines; no structural change to either document.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly on a fresh local stack: `npx supabase db reset` exits 0.
- Existing test suite still passes: `npm run test`.
- Lint passes: `npm run lint`.

#### Manual Verification:

- After `npx supabase db reset`, open Supabase Studio (`http://localhost:54323`) and confirm all four tables exist with RLS enabled.
- Using the seeded mechanic's session (sign in as `mechanic@example.test` via `/auth/signin`, or query with that JWT), confirm a `select` on `clients`/`vehicles`/`service_entries` returns only the seeded rows for that workshop.
- Using the seeded client's session (`client@example.test`), confirm a `select` on `vehicles`/`service_entries` returns only their own vehicle/entry, and a `select` on another workshop's data (if you seed a second mechanic/client pair for this check) returns zero rows.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Role plumbing in middleware and shared types

### Overview

Thread the new `profiles.role` into the app: extend `App.Locals` with the profile/role, look it up in middleware, and give the app a shared `Role` type.

### Changes Required:

#### 1. Shared types module

**File**: `src/lib/types.ts` (new)

**Intent**: Give the codebase a first shared-types home for the `Role` type, since none exists yet and `src/env.d.ts` only types ambient globals.

**Contract**: Export `type Role = 'mechanic' | 'client'`.

#### 2. Locals typing

**File**: `src/env.d.ts`

**Intent**: Make the authenticated user's role available on `Astro.locals` alongside the existing `user`.

**Contract**: Add `profile: { role: Role } | null` to `App.Locals`, importing `Role` from `@/lib/types`.

#### 3. Middleware role lookup

**File**: `src/middleware.ts`

**Intent**: After resolving `context.locals.user`, fetch that user's `profiles.role` and set `context.locals.profile` so downstream pages can gate by role without each one re-querying Supabase.

**Contract**: When `user` is non-null, `select role from profiles where id = user.id` via the existing Supabase client and assign the result to `context.locals.profile` (`null` if no profile row, e.g. Supabase misconfigured). No change to `PROTECTED_ROUTES` in this phase — route gating by role is Phase 3.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`.
- Existing test suite still passes: `npm run test`.
- Lint passes: `npm run lint`.

#### Manual Verification:

- Sign in as the seeded mechanic and the seeded client in turn; confirm (e.g. via a temporary `console.log` or the existing `/dashboard` page showing `Astro.locals.profile?.role`) that each session resolves the correct role.

---

## Phase 3: Role-gated dashboard routes

### Overview

Split the single dashboard into a client view and a mechanic view, with `/dashboard` redirecting mechanics to their own route.

### Changes Required:

#### 1. Mechanic dashboard route

**File**: `src/pages/dashboard/mechanic.astro` (new)

**Intent**: Placeholder mechanic-facing dashboard landing page — no domain data rendering yet (S-01's job), just a role-gated page mechanics land on.

**Contract**: Mirrors the structure of the existing `src/pages/dashboard.astro:1-28` (welcome message, sign-out form), styled for the mechanic role.

#### 2. Route gating and redirect

**File**: `src/middleware.ts`

**Intent**: Extend protection to the new route and keep each role on its own dashboard: a client hitting `/dashboard/mechanic` is redirected to `/dashboard`; a mechanic hitting `/dashboard` is redirected to `/dashboard/mechanic`.

**Contract**: Add `/dashboard/mechanic` to `PROTECTED_ROUTES`. After the existing auth check, when `context.locals.profile?.role === 'mechanic'` and the pathname is exactly `/dashboard`, redirect to `/dashboard/mechanic`; when `role === 'client'` and the pathname is `/dashboard/mechanic`, redirect to `/dashboard`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`.
- Existing test suite still passes: `npm run test`.
- Lint passes: `npm run lint`.

#### Manual Verification:

- Sign in as the seeded mechanic; confirm visiting `/dashboard` redirects to `/dashboard/mechanic`, and that URL loads without error.
- Sign in as the seeded client; confirm `/dashboard` loads directly (no redirect) and visiting `/dashboard/mechanic` directly redirects back to `/dashboard`.
- Signed-out visitor hitting either route is still redirected to `/auth/signin` (no regression in existing gating).

---

## Testing Strategy

### Unit Tests:

- No new unit tests are added in this change (no pure-logic units beyond direct DB/Supabase calls, which aren't unit-testable without a running local stack).

### Integration Tests:

- None automated — RLS and role-gating are verified manually per phase, per the "manual verification approach" decision made during planning (no pgTAP/test-DB tooling exists in this repo yet).

### Manual Testing Steps:

1. `npx supabase db reset` to apply the migration and seed data from a clean slate.
2. Verify RLS as both seeded roles directly in Supabase Studio (Phase 1 manual checks).
3. Run `npm run dev`, sign in as each seeded role, and confirm dashboard routing and redirects behave per Phase 3 manual checks.

## Migration Notes

This is a purely additive migration against an empty schema — no existing data to migrate. Applying it against an already-provisioned remote Supabase project (if one exists) is a manual step (`supabase link` + `supabase db push`), left out of this change per "What We're NOT Doing."

## References

- Roadmap entry: `context/foundation/roadmap.md:76-88` (F-01)
- PRD Access Control / NFR: `context/foundation/prd.md:85-92`, `context/foundation/prd.md:76`
- Tech stack rationale: `context/foundation/tech-stack.md`
- Local Supabase workflow: `context/changes/local-supabase-setup/plan.md`
- Current auth baseline: `src/middleware.ts:1-25`, `src/pages/api/auth/signup.ts:1-21`, `src/pages/dashboard.astro:1-28`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Database schema, RLS, and role-assignment trigger

#### Automated

- [x] 1.1 Migration applies cleanly on a fresh local stack: `npx supabase db reset` exits 0 — 78c3b4b
- [x] 1.2 Existing test suite still passes: `npm run test` — 78c3b4b
- [x] 1.3 Lint passes: `npm run lint` — 78c3b4b

#### Manual

- [x] 1.4 All four tables exist with RLS enabled in Supabase Studio after reset — 78c3b4b
- [x] 1.5 Seeded mechanic's session sees only their own workshop's clients/vehicles/entries — 78c3b4b
- [x] 1.6 Seeded client's session sees only their own vehicle/entry, and nothing from another workshop — 78c3b4b

### Phase 2: Role plumbing in middleware and shared types

#### Automated

- [ ] 2.1 Type checking passes: `npx astro check`
- [ ] 2.2 Existing test suite still passes: `npm run test`
- [ ] 2.3 Lint passes: `npm run lint`

#### Manual

- [ ] 2.4 Each seeded session resolves the correct role via `Astro.locals.profile?.role`

### Phase 3: Role-gated dashboard routes

#### Automated

- [ ] 3.1 Type checking passes: `npx astro check`
- [ ] 3.2 Existing test suite still passes: `npm run test`
- [ ] 3.3 Lint passes: `npm run lint`

#### Manual

- [ ] 3.4 Mechanic session visiting `/dashboard` redirects to `/dashboard/mechanic`
- [ ] 3.5 Client session loads `/dashboard` directly and is redirected back from `/dashboard/mechanic`
- [ ] 3.6 Signed-out visitor is still redirected to `/auth/signin` from either route
