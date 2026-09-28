# Client dashboard UI audit — Plan Brief

> Full plan: `context/changes/client-dashboard-ui-audit/plan.md`
> Research: `context/changes/client-dashboard-ui-audit/research.md`
> Charges: `context/changes/client-dashboard-ui-audit/charges.md`

## What & Why

The client dashboard (`/dashboard`) works, but it has five problems:
- it bypasses the repo's shared Button and duplicates the card markup;
- secondary text uses the same colour as main text, so nothing stands out;
- a failed load shows the same "No vehicle yet." screen as the empty state;
- service data is shown in raw machine formats.

This change fixes the view against those charges, using the design contract the repo already has.

## Starting Point

- Tokens already live in `src/styles/global.css` (olive shadcn preset), split correctly between `:root` and `@theme inline`.
- `src/components/ui/` has only `button.tsx`.
- `ServiceHistory.astro` is shared with the mechanic's client detail page.
- Four review findings from the olive theme change still point at this view (F1/F2/F3/F6).

## Desired End State

A client sees:
- a clear hierarchy: heading → vehicle card with **Next service** → history;
- data such as `23 wrz 2026`, `85 000 km`, `150,00 zł`;
- a sign-out button with a visible focus ring;
- distinct, actionable error, no-vehicle and 0-entries states.

A dev-only `/dev/dashboard-states` page renders every state, with before and after screenshots at 1280px and 375px.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Charge 4 scope | Error vs empty; unlinked-client and missing-config cases dropped | Research showed those two are unreachable (signup → mechanic role; middleware redirect) | Research |
| Data formats | pl-PL + PLN via `Intl`, English copy | Polish workshop; bare `150.00` is ambiguous | Plan |
| Next due | "Next service" on the vehicle card, from the newest entry only | The most actionable information for a client, with no data change | Plan |
| Card | `npx shadcn add card` | Real DS component via the stack's path, ready for the other 9 copies | Plan |
| Global tokens | Fix F1 (`--ring`, drop `/50`) and F2 (`--muted-foreground` ≥ 4.5:1) | Two value changes fix a11y everywhere; the skill allows "one view + global tokens" | Plan |
| Visual gate | Kitchen sink + headless Edge script, no Playwright | No new dependency; shows every state at once without auth | Plan |
| Testability | Move the view into props-driven `ClientDashboardView.astro` | Kitchen sink and the real page render identical markup | Plan |

## Scope

**In scope:**
- `dashboard.astro` and the new `ClientDashboardView.astro`;
- `ServiceHistory.astro`;
- `src/lib/service-history.ts` + tests;
- `ui/card.tsx`;
- two `:root` tokens + the base outline;
- the kitchen sink route and the screenshot script.

**Out of scope:**
- the mechanic dashboard header/button and the other card copies;
- dark mode and UI language;
- middleware/roles;
- the `clients_update_mechanic` RLS gap;
- Playwright and screenshot diffing.

## Architecture / Approach

`dashboard.astro` (data + `loadError`) → `ClientDashboardView.astro` (four exclusive branches: error → no vehicle → 0 entries → entries), built from `Card`, `buttonVariants` and `ServiceHistory` → `service-history.ts` (sort, formatters, `nextService`). `/dev/dashboard-states` feeds the same view with fixtures, and `scripts/screenshot-states.mjs` captures it with headless Edge.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Visual gate | View moved out (no visual change), kitchen sink, "before" screenshots | Moving the markup changes it by accident |
| 2. Contract | Token fixes with a recorded `tokens.md`; shadcn Card | Token change shifts every screen; the contrast math must hold |
| 3. The one view | Card/Button/roles, pl-PL formatting, Next service | pl-PL NBSP in tests; UTC-safe dates; the mechanic page also changes |
| 4. States + final gate | Distinct error/empty states, focus check, "after" screenshots, charges result | Autofocus may not show `:focus-visible` headless (manual fallback) |

**Prerequisites:** local Supabase running with the seed (`client@example.test`, `mechanic@example.test` / `password123`), `npm run dev`, MS Edge installed.
**Estimated effort:** about 1–2 sessions over 4 small phases.

## Open Risks & Assumptions

- Assumes shadcn `card.tsx` renders statically in `.astro` without `client:` (an inference, verified in Phase 2/3).
- The new-york Card defaults (`rounded-xl`, `py-6`) differ visibly from the current `rounded-2xl p-6`. This is intended and must be explained in the before/after note.
- A mechanic whose profile lookup failed still lands on `/dashboard` and sees the no-vehicle copy. The middleware is unchanged.

## Success Criteria (Summary)

- A client can tell "nothing yet" apart from "something broke", and can see when the next service is due.
- The view uses only repo tokens and components; secondary text meets AA contrast; focus is visible.
- The before/after screenshots of every state are in the change folder, with each difference explained.
