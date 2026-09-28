# Shareable Vehicle History Link Implementation Plan

## Overview

A signed-in client can generate one time-limited (24h), read-only public link to their vehicle's service history for a prospective buyer (roadmap S-03, PRD FR-005). The client can also revoke it. Anyone holding the link sees the vehicle (make, model, registration) and, for each entry, the service type, service date and mileage, without logging in. Cost, notes and next-due fields never leave the database.

## Current State Analysis

- Every RLS policy on `vehicles` and `service_entries` requires `auth.uid()` (`supabase/migrations/20260922120000_roles_and_domain_schema.sql:57-164`), so an anonymous viewer can read nothing. There is no service-role key either: `astro.config.mjs:17-20` declares only `SUPABASE_URL` / `SUPABASE_KEY` (anon).
- The client dashboard (`src/pages/dashboard.astro`) loads the signed-in client's single vehicle with embedded `service_entries(*)` through RLS (`clients_select_own`) and renders `ClientDashboardView.astro`. That view has four states: load error, vehicle with entries, vehicle with no entries, and no vehicle.
- Middleware (`src/middleware.ts:5`) protects only `/dashboard*`. It loads the profile only for protected routes, so a new `/share/*` route is public with no routing change.
- Write paths use a plain form POST to an API route, which redirects back with `?error=<message>` (`src/pages/api/clients/[id]/entries.ts`). An atomic multi-row write lives in an RPC that is `security invoker`, with `revoke … from public, anon` and `grant … to authenticated` (`supabase/migrations/20260923120000_service_entry_loop.sql:203-235`).
- Formatting helpers (`formatServiceDate`, `formatMileage`, `sortNewestFirst`) live in `src/lib/service-history.ts`, with vitest tests next to them (`src/lib/service-history.test.ts`).
- The dev kitchen sink `src/pages/dev/dashboard-states.astro` renders every dashboard state from fixtures. `scripts/screenshot-states.mjs:16` screenshots that one hardcoded URL.
- `scripts/smoke.mjs` is a zero-dependency HTTP step list that CI runs against the production preview.
- No `context/foundation/lessons.md` exists yet.

## Desired End State

- The client dashboard shows a "Share history" card when a vehicle exists:
  - With no active link, it shows a "Create share link" button.
  - With an active link, it shows the full URL, a Copy button, the expiry time (Europe/Warsaw), a "Create new link" button (which replaces the old link) and a "Revoke" button.
- `GET /share/<token>` with a valid, unexpired token returns 200 and shows make, model, registration, then entries newest first, each with service type, date and mileage only.
- An unknown, malformed, expired or revoked token returns the same 404 page ("This link is invalid or has expired"). The response does not reveal which of these cases applies.
- The share page response carries `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.
- Verification: `npm run lint`, `npm test`, `npm run build` and `npm run smoke` pass; the manual SQL checks in Phase 1 pass; the kitchen-sink screenshots show every state.

### Key Discoveries:

- Supabase's default privileges grant `EXECUTE` on new `public` functions to `anon`. Every function that must not be anonymous needs an explicit `revoke … from public, anon`. `create_client_with_vehicle` already does this (`20260923120000_service_entry_loop.sql:234`).
- `vehicles` is one per client (`vehicles_client_id_key`, `20260923120000_service_entry_loop.sql:13`), so "the caller's vehicle" is unambiguous inside an RPC.
- `sortNewestFirst` tie-breaks on `created_at`. The public payload must not carry `created_at`, so the public function orders entries in SQL (`service_date desc, created_at desc`) and the page keeps the array order.
- `formatServiceDate` formats in UTC because dates have no time (`src/lib/service-history.ts:3-9`). `expires_at` is a real timestamp, so it needs its own formatter in `Europe/Warsaw`. The Cloudflare runtime runs in UTC.

## What We're NOT Doing

- Showing cost, notes, `next_due_mileage` or `next_due_date` on the public page. Notes are excluded because free text can contain prices.
- More than one concurrent link per vehicle, a list of links, or per-buyer links.
- Configurable expiry (always 24h from creation, computed in the database).
- Distinguishing "expired" from "not found" to the viewer (both are 404).
- Hashing tokens at rest. The token is stored in plaintext so the client can re-copy it for the full 24h.
- Cleaning up expired rows. At most one row per vehicle exists, and it is replaced on the next generation.
- Mechanic-side visibility of share links.
- pgTAP or any new SQL test tooling.
- Access logging or view counts.

## Implementation Approach

The database is the security boundary. Two narrow functions keep it there:

- **Private writes.** `create_share_link()` and `revoke_share_link()` are `security invoker` RPCs, available only to `authenticated` callers. They are gated by RLS policies that let a user with the `client` role touch only the `share_links` row of their own vehicle.
- **Public read.** `get_shared_vehicle_history(p_token)` is a `security definer` function granted to `anon` and `authenticated`. It returns a JSON object built from an explicit column allow-list, or `null`. Because the function body names every returned field, cost cannot leak through a `select *` or a later schema change to `service_entries`.

On top of that, Astro follows the existing form-POST, redirect-with-error pattern for the private side and adds one server-rendered public page.

## Critical Implementation Details

- **Function privileges**: each new function needs an explicit `revoke execute … from public` (and `from anon` for the two write RPCs), followed by the intended `grant`. Supabase's defaults would otherwise expose the write RPCs to `anon`, where they fail only because `auth.uid()` is null. That is not a boundary to rely on.
- **Token generation**: generate the token in SQL from 32 random bytes, base64url-encoded without padding (43 characters). On Supabase, `gen_random_bytes` lives in the `extensions` schema, so call it schema-qualified.

  ```sql
  translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_')
  ```

## Phase 1: Database — share_links, RPCs, public read function

### Overview

Add the table, its client-only RLS, the two write RPCs and the anonymous read function in one migration, then verify the boundary with SQL against local Supabase.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20260928120000_share_links.sql`

**Intent**: Store one share link per vehicle and expose exactly three operations: create/replace, revoke, and a redacted public read. The redaction and the 24h expiry are enforced in the database, so no application code path can bypass them.

**Contract**:

- **Table** `share_links`:
  - Columns:
    - `id uuid pk default gen_random_uuid()`
    - `vehicle_id uuid not null references vehicles(id) on delete cascade`, **unique**
    - `token text not null`, **unique**
    - `created_by uuid not null references auth.users(id)`
    - `created_at timestamptz not null default now()`
    - `expires_at timestamptz not null`
  - RLS enabled.
  - Policies `share_links_select_client`, `share_links_insert_client` and `share_links_delete_client` use the same shape as the `vehicles_*` policies: the vehicle's client has `user_id = auth.uid()`, and `profiles.role = 'client'`.
  - No update policy and no mechanic policies.
- **`create_share_link() returns table(token text, expires_at timestamptz)`**:
  - `security invoker`, `set search_path = public`.
  - Resolves the caller's vehicle through `clients.user_id = auth.uid()` and raises if there is none.
  - Deletes the vehicle's existing row, then inserts a new one with a fresh token and `expires_at = now() + interval '24 hours'`, all in one transaction.
  - Privileges: revoke from `public` and `anon`; grant to `authenticated`.
- **`revoke_share_link() returns void`**:
  - `security invoker`.
  - Deletes the caller's vehicle's row. It is a no-op if there is no row.
  - Same privileges as `create_share_link()`.
- **`get_shared_vehicle_history(p_token text) returns jsonb`**:
  - `security definer`, `stable`, `set search_path = public`.
  - Returns `null` unless a row exists with `token = p_token and expires_at > now()`.
  - Otherwise returns `{"vehicle": {"make", "model", "registration_number"}, "entries": [{"service_type", "service_date", "mileage"}, …]}`, with entries ordered by `service_date desc, created_at desc` and `entries` defaulting to `[]`.
  - Revoke from `public`; grant to `anon` and `authenticated`.

#### 2. Types

**File**: `src/lib/types.ts`

**Intent**: Describe the new row and the public payload, so the page and the dashboard consume typed data.

**Contract**:

- Add `ShareLink { vehicle_id, token, created_at, expires_at }`.
- Add `SharedVehicleHistory { vehicle: Pick<Vehicle, "make" | "model" | "registration_number">; entries: Pick<ServiceEntry, "service_type" | "service_date" | "mileage">[] }`.

### Success Criteria:

#### Automated Verification:

- Migration applies on a clean local database: `npx supabase db reset`
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- As a seeded client, `select * from create_share_link()` returns a 43-character token and an `expires_at` about 24h from now. A second call returns a different token, and the first token no longer resolves.
- `select get_shared_vehicle_history('<token>')` as `anon` returns the vehicle and entries. The JSON contains no `cost`, `notes`, `next_due_*`, `id` or `created_at` keys.
- After `update share_links set expires_at = now() - interval '1 minute'`, `get_shared_vehicle_history` returns `null`. After `revoke_share_link()`, it also returns `null`.
- As `anon`, `select create_share_link()` fails with a permission error. As a mechanic, it raises (no vehicle), and `select * from share_links` returns no rows.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Client generates and revokes the link

### Overview

Wire the two RPCs to form POST endpoints, add pure helpers with unit tests, and add the "Share history" card to the client dashboard.

### Changes Required:

#### 1. Share-link helpers

**File**: `src/lib/share-link.ts` (+ `src/lib/share-link.test.ts`)

**Intent**: Keep the logic that decides what the card shows and what the page accepts pure and testable.

**Contract**:

- `isActive(link: Pick<ShareLink, "expires_at"> | null, now: Date): boolean` returns true only when `expires_at > now`.
- `shareUrl(origin: string, token: string): string` returns `${origin}/share/${token}`.
- `formatExpiry(iso: string): string` uses `pl-PL` in `Europe/Warsaw` with date and time.
- `isShareToken(value: string): boolean` checks `/^[A-Za-z0-9_-]{43}$/`.
- Tests cover the expiry boundary (`expires_at === now` → inactive), `null`, a Warsaw daylight-saving date, and malformed tokens (wrong length, `+`, `/`, `=`).

#### 2. API routes

**Files**: `src/pages/api/share-link/index.ts` (POST: create), `src/pages/api/share-link/revoke.ts` (POST: revoke)

**Intent**: Follow the pattern in `src/pages/api/clients/[id]/entries.ts`: an unauthenticated caller is redirected to sign-in, the route calls the RPC, then redirects to `/dashboard` (or `/dashboard?error=<message>` on failure). A friendly profile-role check before the RPC is optional because RLS and the RPC are the boundary.

**Contract**:

- `POST /api/share-link` calls `rpc("create_share_link")`, then returns a 302 to `/dashboard`.
- `POST /api/share-link/revoke` calls `rpc("revoke_share_link")`, then returns a 302 to `/dashboard`.
- On error, both redirect to `/dashboard?error=<encoded message>`.

#### 3. Dashboard data and card

**Files**: `src/pages/dashboard.astro`, `src/components/ClientDashboardView.astro`, new `src/components/ShareLinkCard.astro`, new `src/components/CopyButton.tsx`

**Intent**:

- The dashboard loads the vehicle's `share_links` row (RLS-scoped) and the `?error` query parameter, and passes both to the view.
- The view renders `ShareLinkCard` below the vehicle card, only in the vehicle state (not load error, not no-vehicle).
- The card shows the "Create share link" form when `isActive` is false. When it is true, it shows the read-only URL, a Copy button, "Expires <formatExpiry>", a "Create new link" form and a "Revoke" form.
- An expired row renders the same as no link.
- The error message renders in a `role="alert"` paragraph.

**Contract**:

- `ClientDashboardView` gains the props `shareLink: Pick<ShareLink, "token" | "expires_at"> | null`, `origin: string` and `shareError?: string`.
- `CopyButton` is a React island (`client:load`) with the prop `{ value: string }`. It calls `navigator.clipboard.writeText` and shows "Copied" briefly.

#### 4. Kitchen sink

**File**: `src/pages/dev/dashboard-states.astro`

**Intent**: Add share-card states so the screenshot gate covers them.

**Contract**: New states for:

- (f) no link
- (g) active link
- (h) expired link, which renders as no link
- (i) share error

Existing states pass `shareLink: null`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Signed in as a client with a vehicle: "Create share link" shows the URL and an expiry about 24h ahead in Polish local time, and Copy puts the URL on the clipboard.
- "Create new link" changes the URL. "Revoke" returns the card to the "Create share link" state.
- A client with no vehicle, and the load-error state, show no share card.
- Kitchen-sink states (f)–(i) render correctly at desktop and mobile widths.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Public share page and gates

### Overview

Add the anonymous `/share/<token>` page with its redacted view and a uniform 404, a smoke step for the public route, and kitchen-sink coverage of the public view.

### Changes Required:

#### 1. Public view component

**File**: `src/components/SharedHistoryView.astro`

**Intent**: Render the buyer-facing page:

- The heading reads "Service history" and the vehicle card shows make, model and registration.
- Entries appear in the given order, with service type, formatted date and formatted mileage.
- An empty-entries message is shown when there are none.
- A short footer line says the link is shared by the owner and time-limited.

It also renders the invalid state: "This link is invalid or has expired." The view reuses `Card`, `formatServiceDate` and `formatMileage`, and does not reuse `ServiceHistory.astro` (which renders cost).

**Contract**: `Props { history: SharedVehicleHistory | null }`. `null` renders the invalid state.

#### 2. Share page

**File**: `src/pages/share/[token].astro`

**Intent**:

- Reject tokens that fail `isShareToken` without a database call.
- Otherwise call `rpc("get_shared_vehicle_history", { p_token })`.
- Treat `null` or an RPC error as invalid.
- Set the response headers, set status 404 for the invalid state, and render `SharedHistoryView`.

**Contract**:

- The route is `/share/[token]`.
- Responses are 200 (valid) or 404 (unknown, malformed, expired or revoked), with identical invalid markup.
- Every response carries the headers `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.

#### 3. Smoke step

**File**: `scripts/smoke.mjs`

**Intent**: CI proves the public route renders, and that it fails closed for anonymous users.

**Contract**: Add the step `"share page rejects unknown token"`, which sends `GET /share/<43 valid-alphabet chars>` and expects 404. Place it right after `"home renders"`, while the cookie jar is still empty.

#### 4. Kitchen sink and screenshot script

**Files**: new `src/pages/dev/share-states.astro`, `scripts/screenshot-states.mjs`

**Intent**: Screenshot the public view states (entries, zero entries, invalid) the same way as the dashboard.

**Contract**:

- `share-states.astro` mirrors `dashboard-states.astro`: DEV-only 404 guard, inline fixtures, stacked `state-frame` sections.
- `screenshot-states.mjs` accepts an optional page path as its second argument (default `/dev/dashboard-states`).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Smoke passes against a running server, including the new share step: `npm run smoke`

#### Manual Verification:

- In a private window (not signed in), the link from Phase 2 shows the vehicle and entries with type, date and mileage, and no cost or notes anywhere in the page source.
- The same link returns the 404 invalid page after revoking, and after forcing `expires_at` into the past. A mangled token shows the identical page.
- Response headers on `/share/<token>` include `X-Robots-Tag`, `Referrer-Policy` and `Cache-Control` as specified.
- `share-states` screenshots at 1280 and 375 px show all three states legibly.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `src/lib/share-link.test.ts`:
  - `isActive` boundary (equal, past, future, `null`)
  - `shareUrl` composition
  - `formatExpiry` in Europe/Warsaw across a daylight-saving boundary
  - `isShareToken` accept/reject cases

### Integration Tests:

- `scripts/smoke.mjs`: an anonymous `GET /share/<unknown>` returns 404 (runs in CI against the production preview with local Supabase).
- The manual SQL checks in Phase 1 cover the database boundary: redaction keys, expiry, revoke, anonymous execute denied, mechanic isolation.

### Manual Testing Steps:

1. Sign in as a seeded client, create a link, and copy it.
2. Open it in a private window. Confirm the fields, the order (newest first) and that no cost or notes appear, including in view-source.
3. Create a new link. Confirm the old URL returns 404.
4. Revoke. Confirm the new URL returns 404.
5. Create a link, force `expires_at` into the past in SQL, and confirm 404 and that the dashboard shows "Create share link".

## Performance Considerations

None beyond the unique indexes on `token` and `vehicle_id`. The public read is a single indexed lookup plus one vehicle's entries.

## Migration Notes

The migration is additive (new table and functions), so no existing data changes. To roll back, drop the three functions and `share_links`.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-03)
- PRD: `context/foundation/prd.md` (FR-005, NFR privacy, Access Control)
- RPC and privilege pattern: `supabase/migrations/20260923120000_service_entry_loop.sql:203-235`
- Form POST and redirect pattern: `src/pages/api/clients/[id]/entries.ts`
- Kitchen sink pattern: `src/pages/dev/dashboard-states.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database — share_links, RPCs, public read function

#### Automated

- [x] 1.1 Migration applies on a clean local database: `npx supabase db reset` — 0c6a9a6
- [x] 1.2 Lint passes: `npm run lint` — 0c6a9a6
- [x] 1.3 Build passes: `npm run build` — 0c6a9a6

#### Manual

- [x] 1.4 create_share_link returns a 43-char token expiring in ~24h; a second call replaces the first — 0c6a9a6
- [x] 1.5 get_shared_vehicle_history as anon returns no cost, notes, next_due_*, id or created_at keys — 0c6a9a6
- [x] 1.6 Expired or revoked token returns null — 0c6a9a6
- [x] 1.7 Anon cannot execute create_share_link; mechanic raises and sees no share_links rows — 0c6a9a6

### Phase 2: Client generates and revokes the link

#### Automated

- [x] 2.1 Unit tests pass: `npm test` — 2786f27
- [x] 2.2 Lint passes: `npm run lint` — 2786f27
- [x] 2.3 Build passes: `npm run build` — 2786f27

#### Manual

- [x] 2.4 Create share link shows URL, Warsaw-time expiry ~24h ahead, and Copy works — 2786f27
- [x] 2.5 Create new link changes the URL; Revoke returns to the create state — 2786f27
- [x] 2.6 No-vehicle and load-error states show no share card — 2786f27
- [x] 2.7 Kitchen-sink states (f)–(i) render at desktop and mobile widths — 2786f27

### Phase 3: Public share page and gates

#### Automated

- [x] 3.1 Unit tests pass: `npm test` — 020d54e
- [x] 3.2 Lint passes: `npm run lint` — 020d54e
- [x] 3.3 Build passes: `npm run build` — 020d54e
- [x] 3.4 Smoke passes including the share step: `npm run smoke` — 020d54e

#### Manual

- [x] 3.5 Private window shows type, date, mileage; no cost or notes in page source — 020d54e
- [x] 3.6 Revoked, expired and mangled tokens show the identical 404 page — 020d54e
- [x] 3.7 Share page response carries X-Robots-Tag, Referrer-Policy and Cache-Control headers — 020d54e
- [x] 3.8 share-states screenshots at 1280 and 375 px show all three states — 020d54e
