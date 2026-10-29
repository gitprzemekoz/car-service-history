# App logo in the top-left corner — Implementation Plan

## Overview

Add a simple app logo (inline SVG mark + "Car Service History") to the top-left corner of every page. Clicking it navigates to the home page `/`.

## Current State Analysis

- Every page renders `src/layouts/Layout.astro`; it is the only shared wrapper (`<slot />` at `src/layouts/Layout.astro:35`).
- `src/components/Topbar.astro` is rendered only on `/` (via `src/components/Welcome.astro:18`), so it cannot carry an every-page logo.
- Page wrappers differ: auth and 500 pages center a card in `min-h-screen` (`src/pages/auth/signin.astro:9`); dashboard/share views use `p-4` + centered `max-w-3xl` with `py-8` (`src/pages/dashboard/mechanic.astro:38`, `src/components/SharedHistoryView.astro:13`). An in-flow header would add height and cause vertical scroll on `min-h-screen` pages.
- On `/`, the Topbar sits in the top-left inside `p-4 sm:p-8` (`src/components/Welcome.astro:17`) — it would collide with a top-left overlay.
- Colors come from theme tokens (`text-primary`, `bg-card`, `border-border`) in `src/styles/global.css`.

## Desired End State

- Every page shows a logo link in the top-left corner; activating it navigates to `/`.
- Existing page layouts keep their height/centering; the home Topbar no longer overlaps the logo.
- A Playwright spec covers visibility on `/` and `/auth/signin` and the click-through to `/`.

### Key Discoveries:

- Single insertion point: `src/layouts/Layout.astro` (body, before `<slot />`).
- Anonymous e2e pattern: `tests/e2e/page-title.spec.ts:4` (`test.use({ storageState: { cookies: [], origins: [] } })`).

## What We're NOT Doing

- No in-flow header bar / navigation menu.
- No favicon change, no `public/logo.svg` asset file.
- No change to the Welcome hero copy or Topbar links.

## Implementation Approach

A self-contained `AppLogo.astro` component rendered as an absolute overlay from the shared layout, plus a top-padding tweak on the home page where the Topbar would otherwise sit under it.

## Phase 1: App logo in the layout

### Overview

Create the logo component, mount it in the layout, resolve the home-page collision, and pin behavior with e2e.

### Changes Required:

#### 1. Logo component

**File**: `src/components/AppLogo.astro`

**Intent**: A simple, theme-aware brand mark that links home.

**Contract**: `<a href="/" aria-label="Car Service History — home" data-testid="app-logo">` containing an inline `aria-hidden` SVG (car/wrench mark, `currentColor`, `text-primary`) and the text "Car Service History" (`font-semibold text-foreground`). Positioned `absolute top-3 left-3 z-20`, with a visible focus ring (`focus-visible:ring-ring`).

#### 2. Layout mount

**File**: `src/layouts/Layout.astro`

**Intent**: Render the logo on every page without changing page flow.

**Contract**: `<AppLogo />` placed in `<body>` immediately before `<slot />`; body gets `position: relative` so the overlay anchors to the page top.

#### 3. Home Topbar spacing

**File**: `src/components/Welcome.astro`

**Intent**: Keep the Topbar from sitting under the logo on `/`.

**Contract**: content wrapper `relative z-10 p-4 sm:p-8` gains enough top padding (e.g. `pt-16`) so the Topbar starts below the logo.

#### 4. E2E spec

**File**: `tests/e2e/app-logo.spec.ts`

**Intent**: Guard the logo's presence and home link.

**Contract**: anonymous storage state; `/` and `/auth/signin` show `getByTestId("app-logo")`; clicking it on `/auth/signin` lands on path `/`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Unit tests pass: `npm test`
- E2E spec passes: `npm run test:e2e -- tests/e2e/app-logo.spec.ts`

#### Manual Verification:

- Logo is visible top-left on `/`, `/auth/signin`, `/dashboard` and does not overlap page content at mobile (375px) and desktop widths; clicking it opens `/`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Integration Tests:

- Playwright: logo visible on `/` and `/auth/signin`; click on `/auth/signin` lands on `/`.

### Manual Testing Steps:

1. Open `/` — logo top-left, Topbar below it.
2. Open `/auth/signin` at 375px and desktop — logo top-left, card still centered, no vertical scroll added.
3. Click the logo — lands on `/`.

## References

- Layout: `src/layouts/Layout.astro:35`
- Home Topbar wrapper: `src/components/Welcome.astro:17`
- E2E pattern: `tests/e2e/page-title.spec.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: App logo in the layout

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — ec569ac
- [x] 1.2 Build passes: `npm run build` — ec569ac
- [x] 1.3 Unit tests pass: `npm test` — ec569ac
- [x] 1.4 E2E spec passes: `npm run test:e2e -- tests/e2e/app-logo.spec.ts` — ec569ac

#### Manual

- [x] 1.5 Logo is visible top-left on `/`, `/auth/signin`, `/dashboard` and does not overlap page content at mobile (375px) and desktop widths; clicking it opens `/` — ec569ac
