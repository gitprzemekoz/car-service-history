# Default page title "Car Service History" — Plan Brief

> Full plan: `context/changes/page-title/plan.md`

## What & Why

The home page tab still shows the starter's name "10x Astro Starter". It should show the product name "Car Service History".

## Starting Point

`src/layouts/Layout.astro` defaults `title` to "10x Astro Starter"; only `/` relies on that default. Other pages pass their own titles.

## Desired End State

`/` renders `<title>Car Service History</title>`; all other page titles are unchanged; an e2e spec pins it.

## Key Decisions Made

| Decision        | Choice                          | Why (1 sentence)                                        |
| --------------- | ------------------------------- | ------------------------------------------------------- |
| Subpage titles  | Unchanged (no app-name suffix)  | Keeps the change to exactly the requested scope.        |
| Welcome `<h1>`  | Unchanged                       | It is page content, not the title; out of scope.        |
| Test            | One Playwright `toHaveTitle`    | Cheapest guard against regressing to a default title.   |

## Scope

**In scope:** `Layout.astro` default title, `tests/e2e/page-title.spec.ts`.

**Out of scope:** subpage title suffix, Welcome heading, README branding.

## Architecture / Approach

One-line change to the shared layout's default prop, plus an e2e assertion on `/`.

## Phases at a Glance

| Phase                  | What it delivers                    | Key risk |
| ---------------------- | ----------------------------------- | -------- |
| 1. Default page title  | New default title + e2e spec        | None material |

**Prerequisites:** build + preview for the e2e run.
**Estimated effort:** < 1 session, 1 phase.

## Open Risks & Assumptions

- None.

## Success Criteria (Summary)

- Home page tab reads "Car Service History"; other pages keep their titles; CI is green.
