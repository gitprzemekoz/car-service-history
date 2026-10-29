# Favicon matching the app logo Implementation Plan

## Overview

Replace the starter-template favicon with the car mark used by the in-page app logo, so the browser tab carries the same brand as the page.

## Current State Analysis

- `src/layouts/Layout.astro:19` links a single `<link rel="icon" type="image/png" href="/favicon.png" />`.
- `public/favicon.png` is a 32×32 PNG from the starter template; it has nothing to do with the app logo.
- The logo (`src/components/AppLogo.astro`) is an inline 24×24 SVG car outline: `stroke="currentColor"`, `stroke-width="2"`, round caps/joins, colored by `text-primary`.
- `primary` is `oklch(0.228 0.013 107.4)` ≈ `#1d1d16` in light theme and `oklch(0.93 0.007 106.5)` ≈ `#e8e8e3` in dark theme (`src/styles/global.css:16`, `:50`).
- The app-logo change explicitly listed "favicon" as out of scope (`context/archive/2026-10-29-app-logo/plan-brief.md`).
- No `sharp`/`resvg` in `node_modules`; `@playwright/test` is available for a one-off rasterization.

## Desired End State

Browser tabs show the car mark: dark olive on light tabs, light olive on dark tabs (SVG-capable browsers), and a matching 32×32 PNG for browsers that only take raster icons. Verified by an e2e assertion that both icon links exist and are served, plus a visual check in the browser.

### Key Discoveries:

- Logo paths to reuse verbatim: `src/components/AppLogo.astro:7-24`.
- Anonymous e2e pattern: `tests/e2e/app-logo.spec.ts:4`.
- Layout `<head>` is the single place every page renders: `src/layouts/Layout.astro:16-21`.

## What We're NOT Doing

- No `favicon.ico`, apple-touch-icon, web manifest or maskable icons.
- No change to the in-page `AppLogo` component.
- No new npm dependency or committed icon-generation script — the PNG is rendered once.

## Implementation Approach

Hand-write `public/favicon.svg` from the logo's paths with an embedded `<style>` that sets the stroke to the light-theme primary and switches to the dark-theme primary under `@media (prefers-color-scheme: dark)`. Rasterize the same SVG (light variant) to 32×32 with a throwaway Playwright screenshot (transparent background) and overwrite `public/favicon.png`. Link SVG first and keep the PNG as fallback.

## Critical Implementation Details

- Use hex colors (`#1d1d16`, `#e8e8e3`) in the SVG, not `oklch()` — favicon SVGs are rendered as isolated images and `currentColor`/page CSS variables do not apply.
- Order the `<link>` tags so modern browsers pick SVG: `<link rel="icon" href="/favicon.svg" type="image/svg+xml" />` then the PNG link with `sizes="32x32"`.

## Phase 1: Favicon from the app logo

### Overview

Add the SVG favicon, regenerate the PNG fallback, link both from the layout, and pin it with e2e.

### Changes Required:

#### 1. SVG favicon

**File**: `public/favicon.svg`

**Intent**: The logo's car mark as a standalone icon that adapts to light/dark browser chrome.

**Contract**: `viewBox="0 0 24 24"`, same four path/circle elements and stroke attributes as `AppLogo.astro`; stroke `#1d1d16` by default, `#e8e8e3` inside `@media (prefers-color-scheme: dark)`; no background.

#### 2. PNG fallback

**File**: `public/favicon.png`

**Intent**: Replace the starter icon with a raster of the new SVG (light variant) for browsers without SVG favicon support.

**Contract**: 32×32 RGBA PNG, transparent background. Generated once via a scratch Playwright script (not committed).

#### 3. Layout links

**File**: `src/layouts/Layout.astro`

**Intent**: Point browsers at the SVG first, PNG as fallback.

**Contract**: `<head>` contains `link[rel=icon][type="image/svg+xml"][href="/favicon.svg"]` followed by `link[rel=icon][type="image/png"][href="/favicon.png"][sizes="32x32"]`.

#### 4. E2E assertion

**File**: `tests/e2e/app-favicon.spec.ts`

**Intent**: Pin that every page advertises both icons and that they are served.

**Contract**: anonymous storage state; on `/`, both `link[rel=icon]` elements exist with the hrefs above; requesting each href returns 200 with `image/svg+xml` / `image/png` content type.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Unit tests pass: `npm test`
- Build succeeds: `npm run build`
- E2E spec passes: `npm run test:e2e -- tests/e2e/app-favicon.spec.ts`

#### Manual Verification:

- Browser tab shows the car mark, matching the in-page logo, in light mode
- Browser tab shows a visible light car mark in dark mode

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Integration Tests:

- `tests/e2e/app-favicon.spec.ts`: links present, both assets served with correct content type.

### Manual Testing Steps:

1. Run `npm run dev`, open `/` in a browser with light theme — tab shows the dark car mark.
2. Switch OS/browser to dark theme, hard-reload — tab shows the light car mark.

## References

- Logo implementation: `src/components/AppLogo.astro:7-24`
- Prior change: `context/archive/2026-10-29-app-logo/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Favicon from the app logo

#### Automated

- [x] 1.1 Lint passes: `npm run lint`
- [x] 1.2 Unit tests pass: `npm test`
- [x] 1.3 Build succeeds: `npm run build`
- [x] 1.4 E2E spec passes: `npm run test:e2e -- tests/e2e/app-favicon.spec.ts`

#### Manual

- [x] 1.5 Browser tab shows the car mark, matching the in-page logo, in light mode
- [x] 1.6 Browser tab shows a visible light car mark in dark mode
