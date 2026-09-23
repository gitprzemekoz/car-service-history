# First Service Entry Visible to Client Implementation Plan

## Overview

Close the product's core loop (roadmap S-01, PRD Primary Success Criterion, US-01): a mechanic adds a client together with their vehicle, adds a service entry for that vehicle, and sees service entries only for their own clients; the client signs up with the email the mechanic entered, logs in, and sees their vehicle and its full service history. Covers FR-001, FR-002, FR-003, FR-004.

## Current State Analysis

- F-01 (`context/archive/2026-09-22-roles-and-domain-schema-foundation/`) delivered the schema and RLS in `supabase/migrations/20260922120000_roles_and_domain_schema.sql`: `profiles` (role), `clients` (`mechanic_id`, nullable `user_id`, `name`, `email`), `vehicles` (`client_id`, `make`, `model`), `service_entries` (`service_type`, `service_date`, `cost`, `notes`, `next_due_mileage`, `next_due_date`, `mechanic_id`), plus the `handle_new_user()` signup trigger.
- Both dashboards are placeholders: `src/pages/dashboard.astro:1-28` (client) and `src/pages/dashboard/mechanic.astro:1-28` (mechanic). No domain API routes exist — only `src/pages/api/auth/{signin,signup,signout}.ts`.
- Role gating lives in `src/middleware.ts:5-44`: profile is loaded only for `/dashboard*`; `/dashboard/mechanic*` fails closed for non-mechanics. `/api/*` routes get `locals.user` but never `locals.profile`.
- Form pattern: React form component (`src/components/auth/SignUpForm.tsx`) built from `FormField` / `SubmitButton` / `ServerError`, posting natively to an API route that redirects back with `?error=<message>` (`src/pages/api/auth/signup.ts:10-18`).
- Tests: Vitest in `node` environment, `src/**/*.test.ts` (`vitest.config.ts:10-11`); only `src/lib/utils.test.ts` exists. No DB/integration tests.
- Local Supabase has email confirmations disabled (`supabase/config.toml:209`), so a client can sign up and log in immediately in local dev.

## Desired End State

- `/dashboard/mechanic` lists the mechanic's clients (name, vehicle make/model, registration number, account status "linked" / "waiting for signup") and has an "Add client" form (name, email, make, model, registration number) that creates the client and vehicle atomically.
- `/dashboard/mechanic/clients/[id]` shows that client's vehicle, their service history (newest first), and an "Add service entry" form (type, date, mileage, cost, notes, next-due mileage and/or date). An id not visible to the mechanic under RLS returns 404.
- `/dashboard` (client) shows the client's vehicle card and the full service history newest first (type, date, mileage, cost, notes, next service), with an empty state when there are no entries.
- The database enforces: lowercase unique client emails, one vehicle per client, and mechanic-only inserts/updates on domain tables.

**Verification:** `npx supabase db reset`, then sign in as `mechanic@example.test`, add a new client `New.Client@Example.test` with a vehicle, add an entry; sign up as `new.client@example.test` and see that vehicle and entry on `/dashboard`; confirm the seeded client never sees the new client's data.

### Key Discoveries:

- RLS gap: `clients_insert_mechanic` (`supabase/migrations/20260922120000_roles_and_domain_schema.sql:44-46`) only checks `mechanic_id = auth.uid()`, not role — a logged-in client could insert a `clients` row naming themselves as mechanic and then pass the `vehicles` / `service_entries` insert policies. Must be closed before S-01 exposes write paths.
- Email match in `handle_new_user()` (`…roles_and_domain_schema.sql:175-179`) is case-sensitive, while Supabase Auth stores emails lowercased — a mechanic typing `Jan@Firma.pl` would make the client's signup create a **mechanic** profile. `limit 1` also silently picks among duplicate emails.
- PRD Business Logic (consumed by S-05) needs the odometer mileage of the last service entry; `service_entries` has no such column.
- Middleware already gates any `/dashboard/mechanic/*` subpath (`src/middleware.ts:39-41`), so the new client detail route needs no middleware change.

## What We're NOT Doing

- No editing of service entries (S-02), share links (S-03), flagging (S-04), or reminders/email (S-05).
- No client invitation email — the mechanic tells the client to sign up at `/auth/signup` with the entered email; the list shows whether the account is linked yet.
- No handling of a person who signs up **before** the mechanic adds them (they become a mechanic, per F-01 trigger behavior) — accepted MVP limitation.
- No editing/deleting clients or vehicles, no multi-vehicle support (PRD Non-Goal), no cross-workshop visibility.
- No pagination or search on lists (MVP scale: `target_scale.users: small`).
- No automated RLS tests (pgTAP) — RLS is verified manually on seed data, as in F-01.
- No new validation dependency (e.g. zod) — validators are small pure TS functions.
- No remote Supabase `db push` — same manual step as F-01.

## Implementation Approach

Database first: a second additive migration closes the RLS role gap, hardens email matching, adds the two missing columns, enforces one vehicle per client, and adds a `security invoker` RPC that creates client + vehicle in one transaction (RLS still applies inside it). Then pure, unit-tested validators turn `FormData` into typed inputs. The mechanic side (API routes + two pages) comes next because it produces the data; the client view comes last and only reads.

## Critical Implementation Details

- **Migration on existing rows:** the new `not null` columns (`vehicles.registration_number`, `service_entries.mileage`) have no default. This is safe because F-01's migration was never pushed to a remote project with data; locally `db reset` re-runs `seed.sql`, which must be updated in the same phase or the reset fails.
- **RPC and RLS:** `create_client_with_vehicle` must be `security invoker` (the default) so the tightened insert policies still decide access; a `security definer` function would bypass RLS and reopen the gap this change closes.
- **Profile lookup in API routes:** middleware does not populate `locals.profile` for `/api/*`; the new API routes must look up the caller's role themselves (or middleware must extend its lookup to these routes) and reject non-mechanics with a redirect carrying `?error=`. RLS remains the real boundary; this check gives a readable error instead of a raw Postgres policy violation.

## Phase 1: Schema follow-up migration and seed

### Overview

Close the RLS role gap, harden client email matching, add the missing columns and constraints, and add the atomic client+vehicle RPC.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20260923120000_service_entry_loop.sql` (new)

**Intent**: Additive follow-up to F-01 that makes the schema safe and complete for the first write paths.

**Contract**:
- `vehicles.registration_number text not null`; unique index on `vehicles(client_id)` (one vehicle per client).
- `service_entries.mileage integer not null check (mileage >= 0)`.
- `clients.email` constrained to lowercase (`check (email = lower(email))`) plus unique index on `clients(email)`.
- `handle_new_user()` replaced (`create or replace`) to match `email = lower(new.email)`; behavior otherwise unchanged.
- Drop and recreate the insert/update policies on `clients`, `vehicles`, `service_entries` so each additionally requires `exists (select 1 from profiles where id = auth.uid() and role = 'mechanic')`. Select policies unchanged.
- New function `create_client_with_vehicle(p_name text, p_email text, p_make text, p_model text, p_registration_number text) returns uuid` (the new `clients.id`), `security invoker`, inserting `clients` (with `mechanic_id = auth.uid()`, lowercased email) and `vehicles` in one transaction. A duplicate email surfaces as a unique-violation error the API can map to a friendly message.

#### 2. Seed data

**File**: `supabase/seed.sql`

**Intent**: Keep `db reset` working with the new `not null` columns and give the seeded entry realistic next-service data.

**Contract**: seeded vehicle gets a `registration_number`; seeded service entry gets `mileage` and at least one of `next_due_mileage` / `next_due_date`. Seeded emails are already lowercase.

#### 3. Docs

**File**: `README.md`

**Intent**: The Supabase section (`README.md:115`) mentions only the roles/domain schema migration; note the follow-up migration exists.

**Contract**: one-sentence update of the existing paragraph.

### Success Criteria:

#### Automated Verification:

- Migrations and seed apply cleanly on a fresh local stack: `npx supabase db reset`
- Existing test suite still passes: `npm run test`
- Lint passes: `npm run lint`

#### Manual Verification:

- In Supabase Studio, as the seeded client, inserting a `clients` row with their own id as `mechanic_id` is rejected by RLS
- As the seeded mechanic, calling `create_client_with_vehicle` creates both rows; calling it again with the same email in different case fails with a unique violation and leaves no orphan `clients` row
- Signing up a user whose email differs from a pending client's email only by case links that client row and creates a `client` profile

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Domain types and form validators

### Overview

Typed domain rows and pure validators that turn submitted `FormData` into validated inputs, with unit tests.

### Changes Required:

#### 1. Domain types

**File**: `src/lib/types.ts`

**Intent**: Give pages and API routes shared shapes for the rows they read and the inputs they write, next to the existing `Role`.

**Contract**: `Client`, `Vehicle`, `ServiceEntry` row types matching the Phase 1 schema (dates as ISO strings, `cost` as number); `NewClientInput` (name, email, make, model, registrationNumber) and `NewServiceEntryInput` (serviceType, serviceDate, mileage, cost, notes?, nextDueMileage?, nextDueDate?).

#### 2. Validators

**File**: `src/lib/validation.ts` (new)

**Intent**: Single place for input rules so API routes stay thin and rules are unit-testable.

**Contract**: `parseNewClient(form: FormData)` and `parseNewServiceEntry(form: FormData, today: Date)` each returning `{ ok: true; data } | { ok: false; error: string }` (first error message, suitable for `?error=`). Rules:
- Client: all fields required after trim; email matches the same pattern as `SignUpForm.tsx` and is lowercased; registration number trimmed and uppercased.
- Entry: `serviceType` required; `serviceDate` a valid `YYYY-MM-DD` not after `today`; `mileage` integer ≥ 0; `cost` number ≥ 0 with at most 2 decimals; `notes` optional (empty → undefined); at least one of `nextDueMileage` / `nextDueDate`; `nextDueMileage` > `mileage` when given; `nextDueDate` > `serviceDate` when given.

#### 3. Unit tests

**File**: `src/lib/validation.test.ts` (new)

**Intent**: Lock the rules above, following `src/lib/utils.test.ts` style.

**Contract**: one happy path per parser plus each rejection rule (missing field, bad email, email/registration normalization, future date, negative mileage/cost, neither next-due field, next-due not after current value, boundary: `serviceDate === today` accepted).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- Type checking passes: `npx astro check`
- Lint passes: `npm run lint`

**Implementation Note**: After completing this phase and all automated verification passes, proceed to the next phase (no manual checks).

---

## Phase 3: Mechanic side — add client, add entry, view history

### Overview

API routes for the two write paths and the two mechanic pages that use them.

### Changes Required:

#### 1. Create client + vehicle API

**File**: `src/pages/api/clients/index.ts` (new)

**Intent**: Handle the "Add client" form (FR-001).

**Contract**: `POST` only. Requires a signed-in mechanic (see Critical Implementation Details), else redirect to `/auth/signin` (no user) or `/dashboard` (not a mechanic). Validates with `parseNewClient`; calls `supabase.rpc("create_client_with_vehicle", …)`. Success → redirect `/dashboard/mechanic/clients/<id>`; validation error → `/dashboard/mechanic?error=…`; unique violation on email → `/dashboard/mechanic?error=A client with this email already exists`.

#### 2. Create service entry API

**File**: `src/pages/api/clients/[id]/entries.ts` (new)

**Intent**: Handle the "Add service entry" form (FR-002).

**Contract**: `POST` only, same mechanic check. Loads the client's vehicle via RLS-scoped select (not found → redirect `/dashboard/mechanic?error=Client not found`). Validates with `parseNewServiceEntry(form, new Date())`; inserts into `service_entries` with `mechanic_id = user.id`. Success → redirect `/dashboard/mechanic/clients/<id>`; error → same URL with `?error=…`.

#### 3. Mechanic dashboard: client list + add-client form

**Files**: `src/pages/dashboard/mechanic.astro`, `src/components/mechanic/AddClientForm.tsx` (new)

**Intent**: Replace the placeholder with the mechanic's client list and the add-client form (FR-001, FR-003).

**Contract**: server-side select of the mechanic's `clients` with their `vehicles` (RLS scopes it), ordered by name; each row shows name, email, make/model, registration number, status "Linked" (`user_id` set) or "Waiting for signup — ask the client to sign up with <email>", and links to `/dashboard/mechanic/clients/<id>`. Empty state when no clients. `AddClientForm` follows the `SignUpForm` pattern (client-side required-field checks, native `POST` to `/api/clients`, `ServerError` shows `?error=`). Keeps the existing sign-out form.

#### 4. Client detail page: vehicle, history, add-entry form

**Files**: `src/pages/dashboard/mechanic/clients/[id].astro` (new), `src/components/mechanic/AddServiceEntryForm.tsx` (new), `src/components/ServiceHistory.astro` (new)

**Intent**: Show one client's vehicle and history and let the mechanic add an entry (FR-002, FR-003).

**Contract**: select client + vehicle by id under RLS; no row → `404`. `ServiceHistory` renders a list of entries ordered `service_date desc, created_at desc` with type, date, mileage, cost (2 decimals), notes, next-due mileage/date, and an empty state; it is shared with the client dashboard in Phase 4. `AddServiceEntryForm` posts to `/api/clients/<id>/entries` with fields type, date (defaults to today), mileage, cost, notes (textarea), next-due mileage, next-due date. Back link to `/dashboard/mechanic`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Unit tests pass: `npm run test`
- Lint passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- As the seeded mechanic, adding a client with vehicle redirects to the new client's page, and the client appears on the list as "Waiting for signup"
- Adding a client with an email already used (different case) shows the duplicate-email error and creates nothing
- Adding a service entry shows it at the top of the client's history; invalid input (future date, no next-due value) shows the error and inserts nothing
- A second mechanic (sign up a fresh non-client email) sees an empty list and gets 404 on the seeded client's page URL
- Posting to `/api/clients` while signed in as the seeded client is rejected and creates nothing

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Client side — vehicle and service history

### Overview

Replace the client dashboard placeholder with the client's vehicle and full service history (FR-004, US-01).

### Changes Required:

#### 1. Client dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Show the signed-in client their own vehicle and history.

**Contract**: server-side select of the client's `clients` row (by `user_id`, RLS-scoped) with its vehicle and entries; vehicle card (make, model, registration number) and `ServiceHistory` from Phase 3 (same ordering and fields, including cost). If no vehicle is found (should not happen for a linked client), show a short "No vehicle yet" message instead of erroring. Keeps the existing sign-out form.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Unit tests pass: `npm run test`
- Lint passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- End-to-end US-01: the client added in Phase 3 signs up with that email (any case), lands on `/dashboard`, and sees the vehicle and the mechanic's entry without any manual sync
- The seeded client sees only their own vehicle and entry, never the client added in Phase 3
- A client with no entries sees the empty-state message

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `src/lib/validation.test.ts`: both parsers' happy paths, every rejection rule, normalization of email/registration number, and the `serviceDate === today` boundary.

### Integration Tests:

- None automated (no DB test harness exists). RLS and the RPC are verified manually against the local stack after `npx supabase db reset`.

### Manual Testing Steps:

1. `npx supabase db reset`, `npm run dev`.
2. Sign in as `mechanic@example.test` / `password123`; add client `New.Client@Example.test` with a vehicle; add a service entry.
3. Sign out; sign up as `new.client@example.test`; confirm `/dashboard` shows the vehicle and entry.
4. Sign in as `client@example.test`; confirm only the seeded vehicle/entry is visible.
5. Sign up a fresh email (becomes a mechanic); confirm empty list and 404 on another mechanic's client URL.

## Performance Considerations

Lists are unpaginated and loaded with one nested select per page; fine at MVP scale. Middleware's profile lookup stays scoped to `/dashboard*`.

## Migration Notes

Purely additive against local/seed data only. The new `not null` columns have no default, which is safe because no remote project holds F-01 data; pushing to a remote project remains the manual `supabase db push` step noted in `README.md:115`.

## References

- Roadmap entry: `context/foundation/roadmap.md` (S-01)
- PRD: `context/foundation/prd.md` (FR-001–FR-004, US-01, Business Logic, Non-Goals)
- Foundation change: `context/archive/2026-09-22-roles-and-domain-schema-foundation/plan.md`
- Schema + RLS: `supabase/migrations/20260922120000_roles_and_domain_schema.sql`
- Form pattern: `src/components/auth/SignUpForm.tsx`, `src/pages/api/auth/signup.ts`
- Role gating: `src/middleware.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Schema follow-up migration and seed

#### Automated

- [x] 1.1 Migrations and seed apply cleanly on a fresh local stack: `npx supabase db reset` — c50ed0c
- [x] 1.2 Existing test suite still passes: `npm run test` — c50ed0c
- [x] 1.3 Lint passes: `npm run lint` — c50ed0c

#### Manual

- [x] 1.4 Seeded client inserting a `clients` row with their own id as `mechanic_id` is rejected by RLS — c50ed0c
- [x] 1.5 Mechanic RPC creates both rows; same email in different case fails with no orphan row — c50ed0c
- [x] 1.6 Signup with case-different email links the pending client and creates a `client` profile — c50ed0c

### Phase 2: Domain types and form validators

#### Automated

- [x] 2.1 Unit tests pass: `npm run test`
- [x] 2.2 Type checking passes: `npx astro check`
- [x] 2.3 Lint passes: `npm run lint`

### Phase 3: Mechanic side — add client, add entry, view history

#### Automated

- [ ] 3.1 Type checking passes: `npx astro check`
- [ ] 3.2 Unit tests pass: `npm run test`
- [ ] 3.3 Lint passes: `npm run lint`
- [ ] 3.4 Production build succeeds: `npm run build`

#### Manual

- [ ] 3.5 Adding a client with vehicle redirects to its page and lists it as "Waiting for signup"
- [ ] 3.6 Duplicate email (different case) shows the error and creates nothing
- [ ] 3.7 New entry appears at top of history; invalid input shows the error and inserts nothing
- [ ] 3.8 A second mechanic sees an empty list and gets 404 on the seeded client's page
- [ ] 3.9 Posting to `/api/clients` as the seeded client is rejected and creates nothing

### Phase 4: Client side — vehicle and service history

#### Automated

- [ ] 4.1 Type checking passes: `npx astro check`
- [ ] 4.2 Unit tests pass: `npm run test`
- [ ] 4.3 Lint passes: `npm run lint`
- [ ] 4.4 Production build succeeds: `npm run build`

#### Manual

- [ ] 4.5 End-to-end US-01: new client signs up and sees vehicle and entry on `/dashboard`
- [ ] 4.6 Seeded client sees only their own vehicle and entry
- [ ] 4.7 A client with no entries sees the empty-state message
