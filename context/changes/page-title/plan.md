# Default page title "Car Service History" — Implementation Plan

## Overview

Replace the Astro starter's default document title ("10x Astro Starter") with the product name "Car Service History", so the home page browser tab shows the app's name.

## Current State Analysis

- `src/layouts/Layout.astro:10` defaults the `title` prop to `"10x Astro Starter"` and renders it in `<title>`.
- Only `src/pages/index.astro` renders `<Layout>` without a `title`, so the default is visible on `/` only. Every other page passes its own title (e.g. `src/pages/auth/signin.astro:8` "Sign in").
- `src/components/Welcome.astro:22` shows a visible `<h1>10x Astro Starter</h1>` — page content, not the document title.
- No test asserts any page title today. E2E specs live in `tests/e2e/*.spec.ts`.

## Desired End State

- `/` renders `<title>Car Service History</title>`.
- Pages that pass a `title` keep it unchanged.
- A Playwright spec asserts the home page title.

### Key Discoveries:

- Default lives in one place: `src/layouts/Layout.astro:10`.
- E2E pattern for anonymous home-page visits: `tests/e2e/db-unavailable-warning.spec.ts:5` (`test.use({ storageState: { cookies: [], origins: [] } })`).

## What We're NOT Doing

- No app-name suffix on subpage titles (e.g. "Sign in | Car Service History").
- No change to the Welcome `<h1>` heading.
- No change to `README.md` or other starter branding.

## Implementation Approach

Change the default prop value in the shared layout and pin it with one e2e assertion.

## Phase 1: Default page title

### Overview

Set the layout's default title to "Car Service History" and cover it with an e2e spec.

### Changes Required:

#### 1. Layout default title

**File**: `src/layouts/Layout.astro`

**Intent**: Pages that do not pass a title get the product name instead of the starter name.

**Contract**: `Props.title` stays optional; default value becomes `"Car Service History"`.

#### 2. E2E spec

**File**: `tests/e2e/page-title.spec.ts`

**Intent**: Prevent regression back to a starter/default title on the home page.

**Contract**: anonymous visit to `/` → `expect(page).toHaveTitle("Car Service History")`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Unit tests pass: `npm test`
- E2E spec passes: `npm run test:e2e -- tests/e2e/page-title.spec.ts`

#### Manual Verification:

- Opening `/` in a browser shows "Car Service History" in the tab; `/auth/signin` still shows "Sign in"

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Integration Tests:

- Playwright: `/` has title "Car Service History".

### Manual Testing Steps:

1. Run the app and open `/` — tab title is "Car Service History".
2. Open `/auth/signin` — tab title is still "Sign in".

## References

- Layout: `src/layouts/Layout.astro:10`
- E2E pattern: `tests/e2e/db-unavailable-warning.spec.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Default page title

#### Automated

- [x] 1.1 Lint passes: `npm run lint`
- [x] 1.2 Build passes: `npm run build`
- [x] 1.3 Unit tests pass: `npm test`
- [x] 1.4 E2E spec passes: `npm run test:e2e -- tests/e2e/page-title.spec.ts`

#### Manual

- [x] 1.5 Opening `/` in a browser shows "Car Service History" in the tab; `/auth/signin` still shows "Sign in"
