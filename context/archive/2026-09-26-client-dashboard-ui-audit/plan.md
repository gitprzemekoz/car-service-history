# Client dashboard UI audit — Implementation Plan

## Overview

Fix the client dashboard (`/dashboard`) against the five charges in `charges.md`. The fixes are:
- the repo's own contract: shadcn `Card`, `buttonVariants` and token roles, plus two global token fixes (F1/F2);
- an error state that is distinct from the empty state;
- pl-PL/PLN formatting of service data;
- a "Next service" summary.

A dev-only kitchen-sink page with headless-Edge screenshots gates every phase. One view plus global tokens; no MVP-wide restyle.

## Current State Analysis

- **View:** `src/pages/dashboard.astro:21-28` fetches the client → vehicle → service_entries graph and throws away `error`. Lines `:35-76` render:
  - a header (h1, "Signed in as" in `text-foreground`, and a hand-rolled sign-out button at `:46-51`);
  - three copies of the card class string (`:57`, `:64`, `:70`);
  - one fallback, "No vehicle yet." (`:69-73`).
- **Shared unit:** `src/components/ServiceHistory.astro` sorts entries newest first (`:11-13`), prints raw ISO dates, `cost.toFixed(2)` and ungrouped `km` (`:16`, `:28-38`), and has an empty state (`:20-21`). It is also rendered by `src/pages/dashboard/mechanic/clients/[id].astro:87`.
- **Contract:**
  - Tokens live in `src/styles/global.css`: values at `:7-74`, published at `:76-117`, base `outline-ring/50` at `:121`.
  - Components live in `src/components/ui/`: only `button.tsx` (new-york, `components.json:3`). There is no card.
- **Reachable states** (research.md, "Reachable states"):
  - entries;
  - 0 entries (the normal state after a mechanic creates the client);
  - query error → currently "No vehicle yet.";
  - mechanic with a failed profile lookup → currently "No vehicle yet.".
  - Unlinked-client and missing-config states are unreachable.
- **Tooling:**
  - vitest runs with `node` env over `src/**/*.test.ts` (`vitest.config.ts:10-11`).
  - There is no Playwright dependency. MS Edge is installed at `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`.
  - The dev-only pattern is `import.meta.env.DEV` (`src/pages/auth/confirm-email.astro:4`).

## Desired End State

A signed-in client opens `/dashboard` and sees:
- a clear heading, with account meta and the plate number in muted text;
- a vehicle card with a **Next service** line (date and/or mileage from the newest entry), which is hidden when neither value is set;
- a history of entries formatted as `23 wrz 2026`, `85 000 km`, `150,00 zł`;
- a sign-out button with a visible focus ring.

If the query fails, they see an error card with a "Try again" link, not "No vehicle yet.". With 0 entries they see copy that explains the mechanic adds entries after each visit.

`/dev/dashboard-states` renders every state side by side in dev and returns 404 in a build. Screenshots at 1280px and 375px from before and after the change are stored in `context/changes/client-dashboard-ui-audit/screenshots/`.

### Key Discoveries:

- The page is SSR only; all state is decided on the server. A presentational component fed by fixtures can therefore show every state without auth (research.md, "Architecture Insights").
- `ServiceHistory` is shared. Formatting changes intentionally reach the mechanic detail page and must be checked there.
- impl-review F1/F2/F3/F6 (`context/changes/ui-theme-change-to-olive/reviews/impl-review.md:24-99`) are PENDING and are resolved by this plan.

## What We're NOT Doing

- The mechanic dashboard's duplicate header and button (`src/pages/dashboard/mechanic.astro:36-51`), and the 9 card copies outside this view. They stay deferred in `charges.md`.
- Dark mode (no toggle exists) and a UI language switch (the copy stays English; only number/date/currency formats become pl-PL).
- Middleware or role changes. A mechanic whose profile lookup failed still lands here and sees the improved "no vehicle" copy.
- The `clients_update_mechanic` RLS gap (deferred, security change).
- Playwright or any new test dependency; automatic screenshot diffing.
- Changes to the entry data model, or a "latest next-due across all entries" rule.

## Implementation Approach

The order follows 10x-ui: gate first so a "before" baseline exists, then the contract (tokens, component), then the view, then the states. Moving the view out into `ClientDashboardView.astro` is the enabling move. `dashboard.astro` keeps only data fetching, and the kitchen sink reuses exactly the markup users see.

## Critical Implementation Details

- **Dates are `YYYY-MM-DD` strings with no time.** Format them with `Intl.DateTimeFormat("pl-PL", { timeZone: "UTC", … })` from `Date.UTC` parts. Local-time parsing shifts the day on the UTC Workers runtime versus a Polish browser. This is the same class of issue as archive impl-review `:14`.
- **pl-PL grouping and the currency suffix use non-breaking spaces.** `Intl` inserts U+00A0 (and possibly U+202F) in `85 000` and `150,00 zł`. Unit tests must compare against `Intl` output or normalize whitespace, not a literal typed space. pl-PL also **does not group 4-digit numbers** (`8500`, while `85 000` is grouped; checked with Node `Intl`). That is correct Polish typography, not a bug. Test it explicitly so no one "fixes" it.
- **Screenshotting focus.** Headless Edge cannot press Tab. The kitchen sink shows the focus state with `autofocus` on the sign-out button in one section only. If Chromium doesn't show `:focus-visible` for autofocus, fall back to a manual Tab check, recorded in Manual verification.

## Phase 1: Visual gate — presentational view, kitchen sink, baseline

### Overview

Move the dashboard body into a props-driven component with **no visual change**. Add the dev-only states page and capture "before" screenshots.

### Changes Required:

#### 1. Presentational view

**File**: `src/components/ClientDashboardView.astro` (new), `src/pages/dashboard.astro`

**Intent**: Move the markup from `dashboard.astro:35-75`, minus `Layout`, into a component so the kitchen sink and the real page render identical markup. `dashboard.astro` keeps the query and passes props.

**Contract**: Props `{ email: string | undefined; vehicle: { make; model; registration_number } | null; entries: ServiceEntry[]; loadError: boolean }`. In this phase, `loadError` is accepted but renders the same "No vehicle yet." as today (the behaviour change lands in Phase 4). The rendered HTML of `/dashboard` for the seeded client is unchanged.

#### 2. Kitchen sink route

**File**: `src/pages/dev/dashboard-states.astro` (new)

**Intent**: Render `ClientDashboardView` once per state, under a small label, from inline fixtures:
- (a) 3 entries: one with notes and all next-due fields, one with a null cost and null next-due, one on the same day to show the tie-break;
- (b) vehicle with 0 entries;
- (c) load error;
- (d) no vehicle;
- (e) focus: section (a) again with the sign-out button focused.

Fixtures are typed as `ServiceEntry`.

**Contract**: Route `/dev/dashboard-states`. It returns `new Response(null, { status: 404 })` when `!import.meta.env.DEV`. It is not under `/dashboard`, so middleware does not guard it (`src/middleware.ts:5`).

#### 3. Screenshot script

**File**: `scripts/screenshot-states.mjs` (new)

**Intent**: A zero-dependency Node script that runs headless Edge against `BASE_URL` (default `http://localhost:4321`) + `/dev/dashboard-states`. It writes `<out>/desktop-1280.png` and `<out>/mobile-375.png`, with the window height tall enough for the full page. It follows the zero-dep style of `scripts/smoke.mjs:1-2`.

**Contract**: `node scripts/screenshot-states.mjs <out-dir>`. The Edge path comes from the `EDGE_PATH` env var, with the Program Files (x86) path as the default. It uses `--headless=new --screenshot=<file> --window-size=<w>,<h> --hide-scrollbars`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Unit tests pass: `npm test`
- Build passes: `npm run build`
- Baseline screenshots exist: `context/changes/client-dashboard-ui-audit/screenshots/before/desktop-1280.png` and `mobile-375.png`

#### Manual Verification:

- `/dashboard` as `client@example.test` looks identical to before the extraction
- `/dev/dashboard-states` shows all five labelled sections in `npm run dev`

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Contract — token fixes and shadcn Card

### Overview

Resolve impl-review F1 (focus ring) and F2 (muted-foreground contrast) at the token layer. Add the real Card component.

### Changes Required:

#### 1. Token values

**File**: `src/styles/global.css`

**Intent**: Darken `:root --muted-foreground` so that small secondary text reaches ≥ 4.5:1 on `--background` and on `bg-muted/50` (target about `oklch(0.53 0.031 107.3)`). Darken `:root --ring` to about L 0.55 in the same hue. Change the base `outline-ring/50` (`:121`) to `outline-ring`. Add a one-line comment next to the edited `:root` block naming the source (impl-review F1/F2 of `ui-theme-change-to-olive`). Leave `.dark` untouched.

**Contract**: The token names are unchanged; only values change. The final values must be verified for contrast (a computed ratio is fine) before commit.

#### 2. Token record

**File**: `context/changes/client-dashboard-ui-audit/tokens.md` (new)

**Intent**: Record the old and new values of every edited token, the contrast ratios computed against `--background` and `--muted`, and the source, so the next session doesn't reinvent them. This is a 10x-ui requirement.

**Contract**: A table with columns token | old | new | contrast | source.

#### 3. Card component

**File**: `src/components/ui/card.tsx` (new, via `npx shadcn add card`)

**Intent**: Add the design-system Card through the stack's path. It renders server-side in `.astro` with no `client:` directive.

**Contract**: Exports `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` (and `CardAction` if generated), in new-york styling. Hand edits to the generated file are not allowed.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- `src/components/ui/card.tsx` exists and `global.css` no longer contains `outline-ring/50`
- `tokens.md` lists `--muted-foreground` and `--ring` with contrast ≥ 4.5:1 for muted-foreground on both background and muted, and ≥ 3:1 for ring

#### Manual Verification:

- Secondary text is visibly darker on `/dev/dashboard-states`, the auth pages and the mechanic dashboard, and nothing looks broken
- Tabbing through `/auth/signin` shows a clearly visible focus outline

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: The one view — Card, Button, roles, formatting, Next service

### Overview

Rebuild `ClientDashboardView` from the contract and make service data readable (charges 1, 2, 3, 5).

### Changes Required:

#### 1. Formatting and summary helpers

**File**: `src/lib/service-history.ts` (new), `src/lib/service-history.test.ts` (new)

**Intent**: Collect the presentation logic in one tested place:
- the newest-first sort, moved out of `ServiceHistory.astro:11-13`;
- pl-PL formatters for date, mileage and cost;
- `nextService(entries)`, which returns the newest entry's next-due date and/or mileage, or `null` when both are null.

**Contract**:
- `sortNewestFirst(entries)`: `service_date` desc, then `created_at` desc. The input is not mutated.
- `formatServiceDate("2026-09-23")` → pl-PL `d MMM yyyy`, UTC-safe.
- `formatMileage(85000)` → `85 000 km`.
- `formatCost(150)` → `150,00 zł`. `null` → `—`.
- `nextService(entries)` → `{ date: string | null; mileage: number | null } | null`, taken from `sortNewestFirst(entries)[0]` only.

Tests cover:
- the sort tie-break;
- a date at a month boundary (`2026-01-01`);
- `0` and `null` cost;
- `nextService` returning null when the newest entry has neither field, even if an older entry has one (the agreed "newest entry" rule).

#### 2. ServiceHistory

**File**: `src/components/ServiceHistory.astro`

**Intent**: Use the helpers for sorting and every formatted value. Keep the structure and `bg-muted/50` entry styling.

**Contract**: The props are unchanged (`entries: ServiceEntry[]`). Both consumers (the client view and `mechanic/clients/[id].astro:87`) get the new formats.

#### 3. ClientDashboardView

**File**: `src/components/ClientDashboardView.astro`

**Intent**:
- Replace the three card copies with `Card`/`CardHeader`/`CardTitle`/`CardContent`.
- Render sign-out with `buttonVariants({ variant: "outline" })` on the `<button>` inside the existing form.
- Use `text-muted-foreground` for "Signed in as" and the registration number.
- Add a "Next service" line to the vehicle card when `nextService` is non-null, showing whichever of date and mileage exist.

**Contract**: No literal colour, hex or radius classes are added. The only roles used are `text-muted-foreground`, `text-foreground` and those from the Card and Button components. The form still POSTs to `/api/auth/signout`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test` (including `src/lib/service-history.test.ts`)
- Lint passes: `npm run lint`
- Build passes: `npm run build`
- No card class-string copies remain in the view: `grep -c "rounded-2xl border border-border bg-card" src/components/ClientDashboardView.astro src/pages/dashboard.astro` returns 0 for both

#### Manual Verification:

- `/dev/dashboard-states` at 1280px and 375px: the hierarchy reads heading → vehicle + Next service → history, and nothing wraps badly at 375px
- The mechanic view `/dashboard/mechanic/clients/<seeded id>` shows the new formats and still looks right
- The real `/dashboard` as `client@example.test` shows `85 000 km`, `150,00 zł` and a Next service line of `23 wrz 2027 · 100 000 km`

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: States and final gate

### Overview

Separate the error state from the empty state (charge 4), give the 0-entries state useful copy, confirm focus, and rerun the gate.

### Changes Required:

#### 1. Error propagation

**File**: `src/pages/dashboard.astro`

**Intent**: Pass `loadError = Boolean(error)` from the clients query to the view. Remove the unreachable `supabase && user` fallback only if the type-safe version stays simple; otherwise leave it.

**Contract**: `loadError` is true exactly when the supabase query returns an `error`.

#### 2. State rendering

**File**: `src/components/ClientDashboardView.astro`, `src/components/ServiceHistory.astro`

**Intent**:
- **error:** a Card saying the service history couldn't be loaded, with a "Try again" link to `/dashboard` styled with `buttonVariants({ variant: "outline" })`, and `role="alert"` on the message. It never shows "No vehicle yet.".
- **no vehicle:** copy explaining that no vehicle is linked to this account and to contact the mechanic.
- **0 entries** (`ServiceHistory`): copy saying the mechanic adds an entry after each visit. The Next service line is hidden when there are no entries.

**Contract**: Four mutually exclusive view branches, in this precedence: loadError → no vehicle → vehicle with 0 entries → vehicle with entries. The mechanic page's empty state gets the same `ServiceHistory` copy. It must still make sense from the mechanic's side, so the wording must be neutral about who is reading, e.g. "No service entries yet — entries appear here after each service visit."

#### 3. Final screenshots and charges update

**File**: `context/changes/client-dashboard-ui-audit/screenshots/after/`, `context/changes/client-dashboard-ui-audit/charges.md`

**Intent**: Rerun `scripts/screenshot-states.mjs` into `after/`. Add a short "Result" note per charge in `charges.md` (resolved, with the phase that resolved it, or still deferred). Explain each visual difference against `before/`.

**Contract**: The `before/` files are never overwritten.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Build passes: `npm run build`
- `/dev/dashboard-states` returns 404 from the built app: `npm run preview` + `curl -o /dev/null -w "%{http_code}" http://localhost:4321/dev/dashboard-states` prints `404`
- After screenshots exist: `screenshots/after/desktop-1280.png` and `mobile-375.png`

#### Manual Verification:

- The kitchen sink shows error, no-vehicle, 0-entries and entries as visibly different states, each with actionable copy
- Keyboard: Tab on `/dashboard` reaches sign-out with a visible ring, and in the error state it also reaches "Try again". Both controls have accessible names
- The before/after comparison is written up in `charges.md`, and every visual difference is explained
- The `ui-quality-checklist` (`.claude/skills/10x-ui/references/ui-quality-checklist.md`) is walked through, and any unchecked item is recorded as deferred with a reason

---

## Testing Strategy

### Unit Tests:

- `src/lib/service-history.test.ts`: sort tie-break and no mutation; UTC-safe date formatting (month boundary); grouping and currency with NBSP-aware assertions; `formatCost(null)`; `nextService` for the newest entry with date only, mileage only, both, neither (with an older entry that has values), and an empty list.

### Integration Tests:

- None added. The kitchen sink and screenshots are the visual gate. The existing `npm run smoke` stays as is; it cannot reach the client dashboard (impl-review F4).

### Manual Testing Steps:

1. `npm run dev`, then open `/dev/dashboard-states` at 1280px and 375px.
2. Sign in as `client@example.test` / `password123`, open `/dashboard`, press Tab to sign-out and check the ring.
3. Sign in as `mechanic@example.test`, open the seeded client's detail page, and check the ServiceHistory formats and empty-state copy.
4. Compare `screenshots/before` with `screenshots/after`.

## Performance Considerations

None. The formatters are created per render on a handful of entries, and the query is unchanged.

## References

- Research: `context/changes/client-dashboard-ui-audit/research.md`
- Charges: `context/changes/client-dashboard-ui-audit/charges.md`
- Prior review: `context/changes/ui-theme-change-to-olive/reviews/impl-review.md:24-99`
- Pattern, dev-only: `src/pages/auth/confirm-email.astro:4`
- Pattern, zero-dependency script: `scripts/smoke.mjs:1-2`
- Checklist: `.claude/skills/10x-ui/references/ui-quality-checklist.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Visual gate — presentational view, kitchen sink, baseline

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — 52e0f4f
- [x] 1.2 Unit tests pass: `npm test` — 52e0f4f
- [x] 1.3 Build passes: `npm run build` — 52e0f4f
- [x] 1.4 Baseline screenshots exist: `context/changes/client-dashboard-ui-audit/screenshots/before/desktop-1280.png` and `mobile-375.png` — 52e0f4f

#### Manual

- [x] 1.5 `/dashboard` as `client@example.test` looks identical to before the extraction — 52e0f4f
- [x] 1.6 `/dev/dashboard-states` shows all five labelled sections in `npm run dev` — 52e0f4f

### Phase 2: Contract — token fixes and shadcn Card

#### Automated

- [x] 2.1 Lint passes: `npm run lint` — aa5e221
- [x] 2.2 Build passes: `npm run build` — aa5e221
- [x] 2.3 `src/components/ui/card.tsx` exists and `global.css` no longer contains `outline-ring/50` — aa5e221
- [x] 2.4 `tokens.md` lists `--muted-foreground` and `--ring` with contrast ≥ 4.5:1 for muted-foreground on both background and muted, and ≥ 3:1 for ring — aa5e221

#### Manual

- [x] 2.5 Secondary text is visibly darker on `/dev/dashboard-states`, the auth pages and the mechanic dashboard, and nothing looks broken — aa5e221
- [x] 2.6 Tabbing through `/auth/signin` shows a clearly visible focus outline — aa5e221

### Phase 3: The one view — Card, Button, roles, formatting, Next service

#### Automated

- [x] 3.1 Unit tests pass: `npm test` (including `src/lib/service-history.test.ts`) — 4cc775f
- [x] 3.2 Lint passes: `npm run lint` — 4cc775f
- [x] 3.3 Build passes: `npm run build` — 4cc775f
- [x] 3.4 No card class-string copies remain in the view: `grep -c "rounded-2xl border border-border bg-card" src/components/ClientDashboardView.astro src/pages/dashboard.astro` returns 0 for both — 4cc775f

#### Manual

- [x] 3.5 `/dev/dashboard-states` at 1280px and 375px: the hierarchy reads heading → vehicle + Next service → history, and nothing wraps badly at 375px — 4cc775f
- [x] 3.6 The mechanic view `/dashboard/mechanic/clients/<seeded id>` shows the new formats and still looks right — 4cc775f
- [x] 3.7 The real `/dashboard` as `client@example.test` shows `85 000 km`, `150,00 zł` and a Next service line of `23 wrz 2027 · 100 000 km` — 4cc775f

### Phase 4: States and final gate

#### Automated

- [x] 4.1 Unit tests pass: `npm test` — 2eab598
- [x] 4.2 Lint passes: `npm run lint` — 2eab598
- [x] 4.3 Build passes: `npm run build` — 2eab598
- [x] 4.4 `/dev/dashboard-states` returns 404 from the built app: `npm run preview` + `curl -o /dev/null -w "%{http_code}" http://localhost:4321/dev/dashboard-states` prints `404` — 2eab598
- [x] 4.5 After screenshots exist: `screenshots/after/desktop-1280.png` and `mobile-375.png` — 2eab598

#### Manual

- [x] 4.6 The kitchen sink shows error, no-vehicle, 0-entries and entries as visibly different states, each with actionable copy — 2eab598
- [x] 4.7 Keyboard: Tab on `/dashboard` reaches sign-out with a visible ring, and in the error state it also reaches "Try again". Both controls have accessible names — 2eab598
- [x] 4.8 The before/after comparison is written up in `charges.md`, and every visual difference is explained — 2eab598
- [x] 4.9 The `ui-quality-checklist` (`.claude/skills/10x-ui/references/ui-quality-checklist.md`) is walked through, and any unchecked item is recorded as deferred with a reason — 2eab598
