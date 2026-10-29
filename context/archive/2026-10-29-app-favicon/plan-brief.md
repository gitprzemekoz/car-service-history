# Favicon matching the app logo — Plan Brief

> Full plan: `context/changes/app-favicon/plan.md`

## What & Why

The browser tab still shows the starter template's favicon. Replace it with the car mark from the app logo so the tab and the page share one brand.

## Starting Point

`Layout.astro` links a single starter `/favicon.png`; the logo is an inline SVG car outline in `AppLogo.astro` colored by the theme's `primary` token.

## Desired End State

Every page's tab shows the car mark: dark olive on light chrome, light olive on dark chrome, with a matching 32×32 PNG for raster-only browsers.

## Key Decisions Made

| Decision   | Choice                                  | Why (1 sentence)                                                  |
| ---------- | --------------------------------------- | ----------------------------------------------------------------- |
| Format     | SVG + regenerated PNG fallback          | Crisp at any size while still covering raster-only browsers.      |
| Dark tabs  | `prefers-color-scheme` media query in SVG | Mirrors the logo's theme behavior and stays visible on dark tabs. |
| PNG source | One-off Playwright render of the SVG    | No new dependency; `sharp`/`resvg` are not installed.             |
| Test       | One Playwright spec                     | Checks links and served assets in a real browser build.           |

## Scope

**In scope:** `public/favicon.svg`, `public/favicon.png`, `Layout.astro` head links, `tests/e2e/app-favicon.spec.ts`.

**Out of scope:** `.ico`, apple-touch-icon, web manifest, changes to `AppLogo`.

## Architecture / Approach

Static assets in `public/`, referenced from the shared layout head (SVG first, PNG fallback). Colors are hardcoded hex equivalents of the theme `primary` tokens because favicons can't read page CSS.

## Phases at a Glance

| Phase                         | What it delivers                         | Key risk                                  |
| ----------------------------- | ---------------------------------------- | ----------------------------------------- |
| 1. Favicon from the app logo  | SVG + PNG icons, layout links, e2e spec  | Browser favicon caching hides the change during manual check |

**Prerequisites:** build + preview for the e2e run.
**Estimated effort:** < 1 session, 1 phase.

## Open Risks & Assumptions

- PNG fallback is single-color (light variant); acceptable since modern browsers use the SVG.

## Success Criteria (Summary)

- Tab icon matches the in-page logo in light and dark mode; CI green.
