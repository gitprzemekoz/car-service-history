# Post-login Role Dashboard Redirect Implementation Plan

## Overview

After a successful sign-in the user should land directly on their own dashboard — mechanics on `/dashboard/mechanic`, clients on `/dashboard` — instead of the generic welcome page at `/`.

## Current State Analysis

- `src/pages/api/auth/signin.ts:19` redirects every successful sign-in to `/`, the starter welcome page (`src/pages/index.astro`). The user must then click "Dashboard" in the Topbar.
- `src/middleware.ts:58-66` already does role routing on `/dashboard*`: a mechanic hitting `/dashboard` is redirected to `/dashboard/mechanic`; a non-mechanic (or missing/failed profile) hitting `/dashboard/mechanic*` is sent back to `/dashboard` (fail closed). Outages answer 503 rather than redirecting.
- `tests/http/role-routing.test.ts` covers that routing (including redirect-loop checks).
- `tests/http/app.ts:101-104` `signInAs` asserts the sign-in response is `302` to `"/"` — it will break once the target changes.
- `tests/e2e/auth.setup.ts:23` comments that sign-in lands on `/` and asserts a visible "Sign out" button; both dashboards also render a "Sign out" button (`ClientDashboardView.astro:48`, `dashboard/mechanic.astro`), so the assertion still holds.

## Desired End State

A successful `POST /api/auth/signin` responds `302 → /dashboard`. Following redirects, a client settles on `/dashboard` (client dashboard) and a mechanic settles on `/dashboard/mechanic`. Failed sign-in behaviour (redirect back to `/auth/signin?error=…`) is unchanged.

### Key Discoveries:

- Role routing lives in one place, the middleware (`src/middleware.ts:58-66`), with outage/missing-profile handling — reuse it rather than duplicating.
- HTTP test harness: `Session` + `locationOf` in `tests/http/app.ts`; redirect-chain follower `follow()` in `tests/http/role-routing.test.ts:112`.

## What We're NOT Doing

- No role lookup inside the sign-in endpoint (mechanics take one extra redirect hop via middleware).
- No redirect of already-signed-in users away from `/auth/signin`, `/auth/signup` or `/`.
- No change to sign-up / confirm-email or sign-out flows.
- No "return to originally requested page" (`?next=`) support.

## Implementation Approach

Change the sign-in success target to `/dashboard` and let the existing, tested middleware pick the role-specific dashboard. Update the test helpers that encode the old target and add HTTP tests that pin the full sign-in → landing-page chain per role.

## Phase 1: Redirect sign-in to the dashboard

### Overview

Point successful sign-ins at `/dashboard`, keep tests green, and prove each role lands on its own dashboard.

### Changes Required:

#### 1. Sign-in endpoint

**File**: `src/pages/api/auth/signin.ts`

**Intent**: On success redirect to `/dashboard` instead of `/`, so middleware routes the user to their role's dashboard.

**Contract**: `POST /api/auth/signin` success → `302 Location: /dashboard`. Error paths unchanged.

#### 2. HTTP test helper

**File**: `tests/http/app.ts`

**Intent**: `signInAs` must accept the new success target, otherwise every HTTP suite fails in `beforeAll`.

**Contract**: `signInAs` throws unless the response is `302` to `"/dashboard"`; error message updated accordingly.

#### 3. HTTP tests for post-login landing

**File**: `tests/http/role-routing.test.ts`

**Intent**: Pin the feature: signing in as a client ends on a complete `/dashboard` page; signing in as a mechanic ends on a complete `/dashboard/mechanic` page.

**Contract**: New `describe("sign-in landing")` that signs in fresh sessions for `a.client` and `a.mechanic`, asserts the sign-in response is `302 → /dashboard`, then uses the existing `follow()` from `/dashboard` and expects status 200, the role's final path, and `assertCompletePage`.

#### 4. E2E auth setup comment

**File**: `tests/e2e/auth.setup.ts`

**Intent**: The comment "Sign-in lands on "/"" becomes false; update it to say sign-in lands on the user's dashboard. The "Sign out" assertion stays valid (both dashboards render it).

**Contract**: Comment-only change.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Unit tests pass: `npm test`
- Type/astro check passes: `npx astro check`
- HTTP tests pass against a local build: `npm run test:http`

#### Manual Verification:

- Signing in via the UI as a client lands on the client dashboard
- Signing in via the UI as a mechanic lands on the mechanic dashboard
- Signing in with a wrong password still shows the error on the sign-in page

**Implementation Note**: After automated verification passes, pause for manual confirmation.

---

## Testing Strategy

### Integration Tests:

- `tests/http/role-routing.test.ts` "sign-in landing": client → `/dashboard`, mechanic → `/dashboard/mechanic`, both complete pages.
- Existing role-routing and redirect-loop tests continue to pass with the new `signInAs`.

### Manual Testing Steps:

1. `npm run build && npm run preview` with local Supabase running.
2. Sign in as a seeded client → client dashboard.
3. Sign out, sign in as a seeded mechanic → mechanic dashboard.
4. Sign in with a wrong password → error on `/auth/signin`.

## Performance Considerations

Mechanics take one extra 302 hop (`/dashboard` → `/dashboard/mechanic`); negligible.

## Migration Notes

None.

## References

- Role routing: `src/middleware.ts:58-66`
- Sign-in endpoint: `src/pages/api/auth/signin.ts:19`
- HTTP harness: `tests/http/app.ts:94-106`, `tests/http/role-routing.test.ts:112-126`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Redirect sign-in to the dashboard

#### Automated

- [x] 1.1 Lint passes: `npm run lint`
- [x] 1.2 Unit tests pass: `npm test`
- [x] 1.3 Type/astro check passes: `npx astro check`
- [x] 1.4 HTTP tests pass against a local build: `npm run test:http`

#### Manual

- [x] 1.5 Signing in via the UI as a client lands on the client dashboard
- [x] 1.6 Signing in via the UI as a mechanic lands on the mechanic dashboard
- [x] 1.7 Signing in with a wrong password still shows the error on the sign-in page
