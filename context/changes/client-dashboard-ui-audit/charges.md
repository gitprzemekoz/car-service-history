# Charges — client dashboard (`/dashboard`)

Audit input for `/10x-plan`. Every charge: file:line + user impact. Charges the plan does not address move to **Deferred** with a reason — never deleted.

Audit basis: source reading on 2026-09-26. Confirm against a desktop + mobile (375px) screenshot during `/10x-research` before planning.

## 1. Missing shared component — hand-rolled Sign out button
- **Where:** `src/pages/dashboard.astro:46-51` (same copy at `src/pages/dashboard/mechanic.astro:44-49`)
- **Shadows:** `src/components/ui/button.tsx` `outline` variant (usable from Astro via `buttonVariants({ variant: "outline" })`).
- **User impact:** the only action on the page gets no `focus-visible` ring (just the global `outline-ring/50`), so keyboard users barely see where focus is, and it drifts from every other button in the app.
- **Result:** resolved in Phase 3 (`buttonVariants({ variant: "outline" })` in `ClientDashboardView.astro`); ring made visible at the token layer in Phase 2 (`--ring`, `outline-ring`, see `tokens.md`). Mechanic copy still deferred (below).

## 2. Missing shared component — card markup copied 3× in one view
- **Where:** `src/pages/dashboard.astro:57`, `:64`, `:70` (`rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm`; 12 copies repo-wide)
- **Shadows:** shadcn `card` (not yet in `src/components/ui/` → `npx shadcn add card`, or an Astro equivalent that uses the same tokens).
- **User impact:** vehicle and history each sit in an equally-weighted box, so the vehicle identity (2 lines) has the same visual weight as the whole history; any radius/padding tweak has to be repeated by hand and will drift.
- **Result:** resolved for this view in Phase 3 — shadcn `Card` (`src/components/ui/card.tsx`, added in Phase 2) replaces all 3 copies; the vehicle card now also carries the Next service line. The 9 copies outside this view stay deferred.

## 3. Missing tokens (role misuse) — secondary text painted as primary text
- **Where:** `src/pages/dashboard.astro:41` ("Signed in as …" uses `text-foreground`), `:61` (registration number `text-foreground`)
- **Token that should cover it:** `text-muted-foreground` (already used for the same role in `ServiceHistory.astro:28,31`).
- **User impact:** account metadata and plate number compete with the "My vehicle" heading and the vehicle name; nothing tells the eye what to read first.
- **Result:** resolved in Phase 3 (`text-muted-foreground` on "Signed in as" and the plate); Phase 2 darkened `--muted-foreground` so the demoted text still passes 4.5:1.

## 4. Accidental architecture — every non-happy entry lands on "No vehicle yet."
- **Where:** `src/pages/dashboard.astro:21-28` (query `error` discarded, `supabase === null` → `{ data: null }`) and `:69-73` (single fallback branch)
- **What the user sees:**
  - signed-up client whose account the mechanic has not linked yet → "No vehicle yet." with no explanation or next step;
  - Supabase query failure / missing config → same "No vehicle yet." (a lie: data may exist);
  - mechanic whose profile lookup failed (middleware fail-closed, `src/middleware.ts:39`) → client view with "No vehicle yet.".
- **User impact:** the user cannot tell "nothing yet, ask your mechanic" from "something broke, retry" — the empty state and the error state are the same screen.
- **Fix direction:** distinct `empty` (no linked client / no vehicle) and `error` states with actionable copy; fix the entry, not the color.
- **Research correction (2026-09-26, `research.md` → Reachable states):** bullets 1 ("unlinked client") and the "missing config" half of bullet 2 are **unreachable** — an unlinked signup becomes a mechanic (`supabase/migrations/20260923120000_service_entry_loop.sql:26-50`) and is redirected (`src/middleware.ts:34-35`); missing config redirects to `/auth/signin` (`src/middleware.ts:15,28-29`). Still valid: query error and mechanic-with-failed-profile → "No vehicle yet.". The empty state users actually hit is **vehicle, 0 entries** (`src/components/ServiceHistory.astro:20-21`) — right after the mechanic creates the client.
- **Result:** resolved in Phase 4. `dashboard.astro` passes `loadError = Boolean(error)`; the view has four exclusive branches (error → no vehicle → 0 entries → entries). Error: `role="alert"` message + "Try again" outline link to `/dashboard`. No vehicle: "No vehicle is linked to this account yet. Contact your mechanic…" (also what a mechanic with a failed profile lookup now sees). 0 entries: reader-neutral "No service entries yet — entries appear here after each service visit." (shared with the mechanic detail page).

## 5. Readability of service entries — raw data formats
- **Where:** `src/components/ServiceHistory.astro:28` (ISO date `2026-09-22`), `:16` (`cost.toFixed(2)`, no currency), `:32`, `:36` (`12345 km`, no grouping), `:38` (raw ISO due date)
- **User impact:** a client scanning history reads machine formats; cost without currency is ambiguous; the "next due" info — the most actionable thing for a client — is buried as the 3rd/4th row of every entry.
- **Scope note:** shared with mechanic client detail page — must be verified there too.
- **Result:** resolved in Phase 3 — `src/lib/service-history.ts` (tested) formats `23 wrz 2026`, `85 000 km`, `150,00 zł` (UTC-safe dates, `Intl` NBSP grouping; 4-digit `8500` intentionally ungrouped per pl-PL). The newest entry's next-due is surfaced as "Next service" on the vehicle card. Verified on the mechanic detail page (3.6).

## Before / after (`screenshots/before` vs `screenshots/after`, 1280px and 375px)

Every visible difference, by kitchen-sink section:
- **All sections — header:** "Signed in as" is muted grey instead of body black (charge 3); the email stays emphasised. Sign out has the outline-button shape and shadow from `buttonVariants` (charge 1).
- **All sections — secondary text:** labels (Mileage, Cost, …), dates and plate are a slightly darker grey (`--muted-foreground` token fix, Phase 2).
- **(a)/(e) vehicle card:** plate muted; new "Next service: 23 wrz 2027 · 95 000 km" line (fixture value; the seeded client shows `100 000 km`). Card padding/radius come from shadcn `Card`, so spacing differs slightly from the hand-rolled `p-6` (charge 2).
- **(a)/(e) history:** dates `2026-09-23` → `23 wrz 2026`, `85000 km` → `85 000 km`, `150.00` → `150,00 zł`; `8500 km` unchanged by design (charge 5). Order unchanged (tie-break unchanged).
- **(b) 0 entries:** "No service entries yet." → "…— entries appear here after each service visit." (charge 4).
- **(c) load error:** was identical to (d) "No vehicle yet."; now an error message with a "Try again" button, even though this fixture passes a vehicle (charge 4, precedence).
- **(d) no vehicle:** "No vehicle yet." → explanation + "Contact your mechanic" next step (charge 4).
- **(e) focus:** the ring around Sign out is now a solid, clearly visible outline instead of the faint 50 % ring (Phase 2 `--ring` / `outline-ring`).
- **375px:** same deltas; the longer empty/no-vehicle/error copy wraps onto 2–3 lines inside the card with no overflow; "Next service" fits on one line.

## UI quality checklist walk-through (`.claude/skills/10x-ui/references/ui-quality-checklist.md`)

- [x] Charges list with file, line and user impact — this file.
- [x] Missing tokens — no one-off hex/spacing added; roles only.
- [x] Missing shared component — Card + `buttonVariants`, no second primitive.
- [x] Accidental architecture — entry points checked: logged out → middleware redirect; no data → 0-entries / no-vehicle states; query error → error state (research.md, Reachable states).
- [x] Unaddressed charges recorded as deferred — see Deferred.
- [x] Tokens from `src/styles/global.css`; [x] shadcn via `shadcn add card`.
- [~] States: default, focus, error, empty covered. **Deferred:** hover is the stock `buttonVariants` hover (not screenshotted — headless can't hover); disabled and loading don't exist (SSR, no disabled controls, no client-side fetch).
- [x] Desktop 1280 + mobile 375.
- [x] Focus visible / control names — Sign out and Try again are native `<button>`/`<a>` with text names; keyboard Tab to be confirmed manually (plan 4.7).
- [~] Dark mode — **deferred:** `.dark` exists but nothing toggles it (see Deferred).
- [x] Kitchen sink `/dev/dashboard-states` + before/after screenshots; `before/` never overwritten.
- [~] `/10x-impl-review` — run for Phase 1 (`reviews/impl-review-phase-1.md`, findings PENDING on the screenshot script and fixture); full-plan review still to run after Phase 4.
- [x] Scope held: one view + global tokens.

## Deferred
- Mechanic dashboard's duplicate header/Sign out button (`src/pages/dashboard/mechanic.astro:36-51`) — other view; one view per change. Fix via follow-up once charge 1 establishes the pattern.
- Dark mode — `.dark` tokens exist but no toggle; no user can reach it today.
- UI language mix (Polish `Banner` in `Layout.astro:24` vs English view copy) — product decision, not a visual one.
- `clients_update_mechanic` RLS policy has no `with check` (`supabase/migrations/20260923120000_service_entry_loop.sql:79-88`) — a mechanic could set `user_id` via raw PostgREST. Security, not visual; separate change. (found in research)
