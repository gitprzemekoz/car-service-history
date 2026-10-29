# App logo in the top-left corner — Plan Brief

> Full plan: `context/changes/app-logo/plan.md`

## What & Why

The app has no visible brand mark and no consistent way back home. Add a simple logo in the top-left corner of every page that links to `/`.

## Starting Point

All pages render `src/layouts/Layout.astro`; the only top bar (`Topbar.astro`) exists solely on `/`, in the top-left corner.

## Desired End State

Every page shows "Car Service History" with a small SVG mark in the top-left; clicking it opens `/`. Page layouts are otherwise unchanged; an e2e spec pins the behavior.

## Key Decisions Made

| Decision  | Choice                               | Why (1 sentence)                                                   |
| --------- | ------------------------------------ | ------------------------------------------------------------------ |
| Placement | Absolute overlay from `Layout.astro` | Does not add height to `min-h-screen` centered pages (auth, 500). |
| Logo form | Inline SVG + app name                | Inherits theme tokens, no new assets.                              |
| Collision | Extra top padding on home Topbar     | Topbar is the only content in the top-left corner today.           |
| Test      | One Playwright spec                  | Verifies visibility and click-through in a real browser.           |

## Scope

**In scope:** `AppLogo.astro`, `Layout.astro` mount, `Welcome.astro` padding, `tests/e2e/app-logo.spec.ts`.

**Out of scope:** header bar/nav menu, favicon, logo asset file, hero copy.

## Architecture / Approach

New component rendered once in the shared layout as `absolute top-3 left-3`; body becomes the positioning context.

## Phases at a Glance

| Phase                     | What it delivers                      | Key risk                                    |
| ------------------------- | ------------------------------------- | ------------------------------------------- |
| 1. App logo in the layout | Component, layout mount, padding, e2e | Overlap with page content on narrow screens |

**Prerequisites:** build + preview for the e2e run.
**Estimated effort:** < 1 session, 1 phase.

## Open Risks & Assumptions

- Dashboard/share headings start ~48px from the top; the logo must stay compact to avoid touching them on mobile (checked manually).

## Success Criteria (Summary)

- Logo visible top-left on every page, links to `/`, no overlap; CI green.
