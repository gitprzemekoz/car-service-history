---
date: 2026-09-26T11:23:26+02:00
researcher: Claude (Opus 5.5) for Przemek Kozinski
git_commit: ff149eaf23b71ac29f4f4987440d298c15d35ad5
branch: main
repository: ai (10x-astro-starter)
topic: "Client dashboard (/dashboard) UI audit — confirm charges, token/component contract, reachable states"
tags: [research, ui, dashboard, ServiceHistory, design-tokens, shadcn]
status: partial
last_updated: 2026-09-26
last_updated_by: Claude (Opus 5.5)
---

# Research: Client dashboard UI audit

**Date**: 2026-09-26T11:23:26+02:00
**Researcher**: Claude (Opus 5.5) for Przemek Kozinski
**Git Commit**: ff149eaf23b71ac29f4f4987440d298c15d35ad5
**Branch**: main
**Repository**: ai (10x-astro-starter)

## Research Question

For `context/changes/client-dashboard-ui-audit` (one view: `/dashboard`): (a) **Audit** — where the token source and shared component catalog live and whether this view reads them; (b) which states the view can actually reach and via which entry; (c) **Reference** — which DS vocabulary to extend; (d) confirm or correct the five charges in `charges.md` before `/10x-plan`.

## Summary

- **Contract exists and the view mostly reads it.** Values: `src/styles/global.css:7-40` (`:root`), `:42-74` (`.dark`), published in `@theme inline` `:76-117` — correct split, no raw colors in `@theme inline`. Components: `src/components/ui/` holds `button.tsx` (shadcn new-york, `components.json:3`) and `LibBadge.astro`; no `card`. `dashboard.astro` and `ServiceHistory.astro` contain zero literal hex/palette classes in the inspected lines; the drift is **role misuse and copied markup**, not missing tokens.
- **Charges 1, 2, 3, 5 confirmed** against source and the rendered HTML of the seeded client (curl, dev server `localhost:4321`, `client@example.test`).
- **Charge 4 partially contradicted.** A "signed-up but unlinked client" never reaches `/dashboard`: the signup trigger makes any email without a pending `clients` row a **mechanic** (`supabase/migrations/20260923120000_service_entry_loop.sql:26-50`), and middleware redirects mechanics to `/dashboard/mechanic` (`src/middleware.ts:34-35`). "Missing config" also never renders the page (redirect at `src/middleware.ts:15,28-29`). Still valid: a **query error** and a **mechanic whose profile lookup failed** both render "No vehicle yet." (`src/pages/dashboard.astro:21-28,69-73`).
- **The empty state that users really hit** is "vehicle, 0 entries" — the normal state right after a mechanic creates the client (`create_client_with_vehicle` inserts no entries, `…service_entry_loop.sql:165-192`). It shows "No service entries yet." (`src/components/ServiceHistory.astro:20-21`) with no hint about what fills it.
- **Four PENDING findings from `ui-theme-change-to-olive/reviews/impl-review.md` land in this view** (F1 focus ring, F2 muted-foreground contrast, F3 hand-rolled buttons, F6 secondary text). They overlap charges 1 and 3 and add two token-level items.
- **Gap:** no browser screenshots were captured (no Playwright/browser automation in `node_modules/.bin`; checked 2026-09-26). The visual gate must be set up in the plan.

## Detailed Findings

### Audit — token source

- Values in `:root` / `.dark`, published via `@theme inline` — `src/styles/global.css:7-117`. Radius scale derived from `--radius` (`:77-80`, `:114-116`). Font `Manrope Variable` (`:113`).
- Base layer applies `outline-ring/50` to every element (`src/styles/global.css:121`) — this 50% ring is the only focus indicator the hand-rolled sign-out button gets.
- `.dark` is defined but no code in `src/**/*.{astro,tsx,ts}` (excluding `ui/button.tsx`) toggles or uses a `dark` class (grep, 2026-09-26). Dark mode is unreachable → light theme only.
- Token-level PENDING items from the previous change:
  - F2: `--muted-foreground` `oklch(0.58 0.031 107.3)` ≈ 4.3:1 on white, 3.9–4.1:1 on `bg-muted/50` (computed, not measured) — `context/changes/ui-theme-change-to-olive/reviews/impl-review.md:43-55`. Affects every `text-muted-foreground` in `ServiceHistory.astro`.
  - F1: focus ring too faint; proposal darkens `--ring` and drops `/50` at `global.css:121` — `impl-review.md:24-41`.

### Audit — component catalog and who reads it

- `Button`/`buttonVariants` exported from `src/components/ui/button.tsx:50`; `outline` variant `:15-16` includes `focus-visible:ring-[3px]` (`:8`).
- `dashboard.astro:46-51` hand-rolls the sign-out button (rendered HTML matches). Same copy at `src/pages/dashboard/mechanic.astro:44-49` (grep for the class string: exactly these 2 files).
- Card class string `rounded-2xl border border-border bg-card …` appears 12 times across `src/` (grep count); 3 of them in `dashboard.astro` (`:57`, `:64`, `:70`). No `card` component exists in `src/components/ui/`.
- Inference (not runtime-verified): a shadcn `card.tsx` is a hydration-free React function component, so it renders in `.astro` without a `client:` directive, like the static usage pattern Astro's React integration allows; existing `.astro` pages use React only with `client:load` for interactive forms (`src/pages/auth/signin.astro:12`, `src/pages/dashboard/mechanic.astro:92`). Alternative with no React: `buttonVariants(...)` / a class helper in `.astro` (impl-review F3 rates this HIGH confidence, `impl-review.md:57-69`).

### Reachable states of `/dashboard`

| State | Entry | What renders today | Evidence |
| --- | --- | --- | --- |
| Client linked, vehicle, ≥1 entries | normal | vehicle card + sorted list | `dashboard.astro:55-68`, `ServiceHistory.astro:11-13,23-43`; seeded: Toyota Corolla / WX 12345, 1 entry (curl) |
| Client linked, vehicle, 0 entries | normal, right after mechanic creates client | vehicle card + "No service entries yet." | `…service_entry_loop.sql:165-192` (RPC adds no entries), `ServiceHistory.astro:20-21` |
| Query error (PostgREST/network) | runtime failure | "No vehicle yet." — `error` discarded | `dashboard.astro:21-28,69-73` |
| Mechanic with failed profile lookup | middleware fail-closed | "No vehicle yet." | `src/middleware.ts:23-24,34,39-40`; query `.eq("user_id", …)` finds no row |
| Mechanic, normal | — | never renders (redirect) | `src/middleware.ts:34-35` |
| Unauthenticated / missing config | — | never renders (redirect to `/auth/signin`) | `src/middleware.ts:15,28-29`; `src/lib/supabase.ts:6-8` |
| Client linked, no vehicle; client with no clients row; >1 linked rows | manual SQL / crafted PostgREST only | "No vehicle yet." | vehicle created atomically `…service_entry_loop.sql:165-192`; unique index `:13`; `clients_update_mechanic` has no `with check` `:79-88` |

- Linking happens only in the signup trigger: pending `clients` row matched by `user_id is null` + email, `limit 1` → `'client'` profile, else `'mechanic'` (`…service_entry_loop.sql:26-50`). Accepted MVP limitation (`context/archive/2026-09-23-first-service-entry-visible-to-client/plan.md:36`).
- The `supabase && user ? … : { data: null }` fallback (`dashboard.astro:22,28`) is unreachable for both null cases, given the middleware redirects above.
- Side finding (security, out of scope for a visual change): `clients_update_mechanic` has `using` but no `with check` (`…service_entry_loop.sql:79-88`), so a mechanic calling PostgREST directly could set `user_id` on their own clients rows. Record as deferred / separate change.

### Confirmation of charges (`charges.md`)

1. **Sign-out button** — supported. `dashboard.astro:46-51`; overlaps impl-review F3.
2. **Card copied 3×** — supported. `dashboard.astro:57,64,70`. The previous change deliberately kept inline card class strings and ruled out component-structure changes *for that change* (`ui-theme-change-to-olive/plan.md:52,65-66`); no decision on `shadcn add card` exists either way.
3. **Secondary text as primary** — supported. `dashboard.astro:41` (also `:42` span) and `:61`; overlaps impl-review F6 (`impl-review.md:91-99`).
4. **"No vehicle yet." for every non-happy entry** — partial. Bullet "signed-up unlinked client" contradicted (becomes mechanic); "missing config" contradicted (redirect); "query failure" and "mechanic with failed profile lookup" supported. The empty state worth designing is "vehicle, 0 entries".
5. **Raw data formats** — supported. Rendered: `2026-09-23`, `85000 km`, `150.00`, `100000 km`, `2027-09-23`. No `Intl`/`toLocale*` usage anywhere in `src/` (grep). The PRD requires cost to be visible (`context/foundation/prd.md:26`) and next-due to be declared (`prd.md:62`), but specifies no currency, locale, or UI language — `ServiceHistory.astro` is also rendered by `src/pages/dashboard/mechanic/clients/[id].astro`.

## Reference (DS vocabulary to extend)

- Extend the in-repo shadcn **new-york** style with **olive** base color (`components.json:3,9`); do not add a second palette or restyle the preset. New primitives via `npx shadcn add <name>` render in new-york (`context/changes/ui-theme-change-to-olive/research.md:73`).
- Role vocabulary already in use: `bg-card`/`text-card-foreground`, `bg-muted/50` for nested items, `text-muted-foreground` for labels/meta, `border-border`, `text-destructive` for errors (`ui-theme-change-to-olive/plan.md:65-75`). Status colors: no new status tokens were introduced (`plan.md:51`).

## Code References

- `src/pages/dashboard.astro:21-28` — query with discarded `error`
- `src/pages/dashboard.astro:36-53` — header (h1, "Signed in as", hand-rolled sign-out)
- `src/pages/dashboard.astro:55-73` — vehicle card, history card, single fallback
- `src/components/ServiceHistory.astro:15-17,20-43` — cost formatting, empty state, entry list
- `src/components/ui/button.tsx:7-33` — `buttonVariants`
- `src/styles/global.css:7-40,76-117,121` — token values, publication, base outline
- `src/middleware.ts:15-40` — auth/role gates
- `supabase/migrations/20260923120000_service_entry_loop.sql:26-50` — signup linking trigger
- `supabase/seed.sql` — `client@example.test` / `password123`, linked, 1 vehicle, 1 entry

## Architecture Insights

- The page is SSR-only Astro; the only interactive element is the sign-out form POST. States are server-decided, so a kitchen-sink page can render every state from fixture props without auth — the cheapest visual gate here.
- `ServiceHistory.astro` is the shared unit; formatting changes there change the mechanic client detail view too.

## Historical Context (from prior changes)

- `context/changes/ui-theme-change-to-olive/reviews/impl-review.md:24-109` — F1, F2, F3, F6 PENDING and directly relevant; F4 (smoke test stale: fresh signup = mechanic) explains why smoke cannot cover the client dashboard; F5, F7 not this view.
- `context/changes/ui-theme-change-to-olive/plan.md:50,54` — dark mode left untouched; no visual test tooling, manual browser check only.
- `context/archive/2026-09-23-first-service-entry-visible-to-client/plan.md:193,230` — S-01 spec: vehicle card + history newest-first, cost 2 decimals; "No vehicle yet" was meant for a case that "should not happen for a linked client".
- `context/archive/2026-09-23-first-service-entry-visible-to-client/reviews/impl-review.md:14,16` — server "today" is UTC; detail-page lookup errors render as 404 (same error-as-empty pattern).

## Related Research

- `context/changes/ui-theme-change-to-olive/research.md`

## Open Questions

1. **Currency and locale** (product decision): PLN + `pl-PL` formatting, or keep neutral? UI language stays English unless decided otherwise.
2. **Next-due prominence**: surface the latest entry's next-due as a highlighted summary on the vehicle card? Not required by PRD (reminders are email-only, `prd.md:72`) — a UX choice.
3. **Card**: `npx shadcn add card` (React, new dependency-free file in `ui/`) vs an Astro class helper — plan decision; must also not break the 9 other copies outside this view.
4. **Token fixes F1/F2** are global: fixing them here changes every view. Allowed by the skill ("one view + global tokens"), but needs an explicit yes.
5. **Visual gate**: screenshots not captured in research. Plan should add a kitchen-sink route (dev-only) rendering: entries, 0 entries, error, focus on sign-out — desktop + 375px.
