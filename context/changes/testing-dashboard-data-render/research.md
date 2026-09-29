---
date: 2026-09-29T14:04:12+02:00
researcher: Claude (Opus 5.5) for Przemek Kozinski
git_commit: f373acd5e0989ed42a5f90f1d49abb85c8b465ce
branch: main
repository: gitprzemekoz/car-service-history
topic: "Dashboard data-render protection + role routing (test-plan Phase 2, risks #1 and #6)"
tags: [research, dashboard, ssr, streaming, astro, cloudflare, middleware, http-integration, test-plan]
status: complete
last_updated: 2026-09-29
last_updated_by: Claude (Opus 5.5)
---

# Research: Dashboard data-render protection + role routing

**Date**: 2026-09-29T14:04:12+02:00
**Researcher**: Claude (Opus 5.5) for Przemek Kozinski
**Git Commit**: f373acd5e0989ed42a5f90f1d49abb85c8b465ce
**Branch**: main
**Repository**: gitprzemekoz/car-service-history

## Research Question

For rollout Phase 2 of `context/foundation/test-plan.md` (risks #1 and #6): what must
an HTTP integration suite against the built app (`astro preview` + local Supabase)
cover to prove that seeded data actually renders on each role's dashboard, that a
render failure is not a silent blank 200, and that role routing holds (a client
never gets mechanic pages/API data; no redirect loops)? Ground, per the test plan
(`test-plan.md:54`, `:59`): how dashboard pages load data, what an exception thrown
mid-stream during SSR does, and where the role is enforced.

## Summary

- **A throw in a child component returns HTTP 200 with a truncated body, and for
  gzip clients that body is empty.** Astro 7.3.2 always streams on the Cloudflare
  adapter. The 200 Response is built before child components render
  (`node_modules/astro/dist/runtime/server/render/page.js:40-57`;
  `@astrojs/cloudflare/dist/utils/handler.js:32` calls `createApp()` with no
  arguments). A throw inside a child `.astro` component, inside page markup wrapped
  in `<Layout>`, or inside a React island's SSR happens after the headers are sent.
  The research agent reproduced this in local workerd (same compat date and flags):
  - With `accept-encoding: gzip` (Node `fetch` default), the decoded body was 0 bytes.
  - With `identity`, the body was partial HTML with no `</html>`.
  - In both runs the stream ended cleanly, so `fetch().text()` did not reject.
  Only a throw in page frontmatter happens before the Response exists. That path
  returns an empty-body 500 (`astro/dist/core/pages/handler.js:73-83` →
  `core/errors/default-handler.js:105`). There is no `500.astro` in `src/pages`.
- **The throwable render code sits entirely in child components.** In the files
  inspected (`src/lib/service-history.ts`, `ServiceHistory.astro`,
  `ClientDashboardView.astro`), three formatters can throw on bad input:
  `formatServiceDate`, `formatEditedDate` and `sortNewestFirst`
  (`src/lib/service-history.ts:26-39`). They are called from
  `ServiceHistory.astro:13,25,43,48` and `ClientDashboardView.astro`. That is the
  exact mid-stream class behind the f763bdb incident.
- **Test oracle for "not a blank 200".** Read the full body and require three
  things: a trimmed body ending in `</html>`, the seeded row's own strings (service
  type plus formatted date), and a marker that renders after the risky component.
  Status alone and "fetch didn't throw" both pass on a blank page.
  `scripts/smoke.mjs:37-83` asserts only status and `location`, so its "mechanic
  dashboard renders" step would pass on a blank 200.
- **Role enforcement for pages lives in one place: `src/middleware.ts:28-41`.** None
  of the four dashboard pages checks the role itself, and data scoping is RLS.
  - Anon on `/dashboard*` → 302 `/auth/signin` (:28-29).
  - Mechanic on exactly `/dashboard` → 302 `/dashboard/mechanic` (:34-35).
  - Any non-mechanic on `/dashboard/mechanic*` → 302 `/dashboard` (:38-41). This
    covers a client, a missing profile or a failed profile lookup, so it fails
    closed.
  A redirect loop is not possible on this path. `/dashboard` only redirects
  mechanics, `/dashboard/mechanic*` only redirects non-mechanics, and
  `/auth/signin` and `/` have no redirect logic.
- **The API returns no data to a client.** No route under `src/pages/api/**` has a
  GET handler. Each of the three mechanic POST routes re-checks `profiles.role` and
  redirects a non-mechanic to `/dashboard`:
  - `api/clients/index.ts:20-23`
  - `api/clients/[id]/entries.ts:21-24`
  - `api/clients/[id]/entries/[entryId].ts:23-26`
- **Two pages swallow query errors into empty or 404 states. The client dashboard
  does not.**
  - `dashboard.astro` sets `loadError = Boolean(error)` and renders a
    `role="alert"` card (`ClientDashboardView.astro:55-65`).
  - `dashboard/mechanic.astro:20-27` reads only `data` (`data ?? []`). A failed
    query renders "No clients yet." exactly like a real empty list.
  - `mechanic/clients/[id].astro:34-36` and `…/edit.astro:27-29` map any error to 404.
  An HTTP test can only catch the mechanic-list case positively, by asserting the
  seeded client's name is present.
- **Seeding and sessions.** HTTP tests can reuse the anon-key fixtures from Phase 1
  (`tests/db/fixtures.ts:36-110`). To get a browser-style session, POST form
  credentials to `/api/auth/signin` and keep the `Set-Cookie` headers, as
  `scripts/smoke.mjs:7-36` does. Two gaps block this today:
  - The fixture password is module-private (`fixtures.ts:17`).
  - Actor emails are not returned.
- **No `data-testid` attributes exist in `src/`.** Stable hooks today are:
  - text content
  - `href`s (the mechanic client links, and per-entry Edit links containing `entryId`)
  - `#share-link-url`
  - edit-form input `id`/`name`/`value`
  - `role="alert"`
  Dates and money render in `pl-PL`, with NBSP separators before "zł"
  (`service-history.ts:4-18`).

## Detailed Findings

### SSR streaming and error surfacing (risk #1 mechanism)

- Versions: astro 7.3.2, @astrojs/cloudflare 14.3.1, @astrojs/react 6.0.5, wrangler 4.131.1.
- Config: `astro.config.mjs` has `output: "server"` and `adapter: cloudflare()`, with
  no streaming or experimental keys.
- Streaming default:
  - `astro/dist/core/app/base.js:73` defaults `streaming = true`.
  - The Cloudflare handler never overrides it (`@astrojs/cloudflare/dist/utils/handler.js:32`).
- Under workerd with `nodejs_compat`, `process` is detected, so rendering takes the
  async-iterable branch (`page.js:42-51`; `render/astro/render.js:81-178`).
  - A render error is stored and rethrown from `iterator.next()` (`render.js:102-104`, `:168-169`).
  - The ReadableStream branch errors the controller the same way (`render.js:72`).
- The page factory runs before the Response is built (`render.js:203`), which is why
  a page-frontmatter throw reaches the `handler.js:73-83` catch and becomes a 500.
- Slot content passed to `<Layout>` is evaluated inside the component-instance
  constructor during the stream walk (`render/astro/instance.js:18-20`), so it is
  mid-stream as well.
- A React island shell error rejects inside `renderToReadableStream`
  (`@astrojs/react/dist/server.js:95-96`) and so also fails mid-stream.
- dev, preview and production share streaming:
  - `astro preview` runs the built worker in workerd through `@cloudflare/vite-plugin`
    (`@astrojs/cloudflare/dist/entrypoints/preview.js:7,29-47`), not in Node.
  - `astro dev` also uses workerd for SSR (`@astrojs/cloudflare/dist/index.js:175-198`).
  - The only difference is case (a): dev shows the error overlay, while preview and
    production return an empty 500.
- Options that turn a mid-stream throw into a non-200 (evidence level noted):
  - **Middleware buffering.** `const res = await next(); await res.text()` rejects
    on a render error. This was verified by a probe in workerd. The middleware
    would then rebuild the Response with the original status and headers, including
    `Set-Cookie`. The cost is that TTFB streaming is lost.
  - **`src/fetch.ts` with `state.streaming = false`.** Rendering would go through
    `renderToString` (`page.js:56`) and throw inside the `handler.js:73-83` catch.
    The `FetchState.streaming` field is public (`core/fetch/fetch-state.d.ts:98-101`).
    This comes from reading the source only and was not tested empirically.
  - **Ruled out:**
    - There is no config key for page streaming.
    - `compressHTML` only changes whitespace and the doctype.
    - `@astrojs/react` `experimentalDisableStreaming` affects only the island.
    - A `500.astro` only helps the frontmatter case.
- `wrangler.jsonc` has `not_found_handling: "404-page"`, but no `404.astro` exists.
  Page-level 404s (`[id].astro:34-36`) are set by the page itself.

### Dashboard pages: data, empty/error states, markers

| Page | Query (anchor) | Error handling | Empty / fail render | Seeded-row markers |
|------|----------------|----------------|---------------------|--------------------|
| `src/pages/dashboard.astro` (client) | `clients.select("id, vehicles(id, make, model, registration_number, service_entries(*))").eq("user_id", user.id).maybeSingle()` (:21-28); share link `share_links…maybeSingle()` (:36-39) | clients: checked, `loadError` (:30); share link: error swallowed | loadError → `role="alert"` "Your service history couldn't be loaded…" (`ClientDashboardView.astro:55-65`); no vehicle → "No vehicle is linked to this account yet…" (:99-106); no entries → "No service entries yet — …" (`ServiceHistory.astro:17`) | h1 "My vehicle", `{make} {model}`, `registration_number`, per-entry `service_type` + `formatServiceDate(service_date)`, `ShareLinkCard` `#share-link-url` |
| `src/pages/dashboard/mechanic.astro` | `clients.select("id, name, email, user_id, vehicles(make, model, registration_number)").order("name")` (:20-25), RLS-scoped | **swallowed** (`data ?? []`, :27) | "No clients yet. Add your first client below." | `<a href="/dashboard/mechanic/clients/{id}">` with `client.name`, email, `{make} {model} · {registration}`, "Linked"/"Waiting for signup…" |
| `…/mechanic/clients/[id].astro` | `clients…service_entries(*)…eq("id", id).maybeSingle()` (:24-30) | **swallowed** → 404 (:34-36) | "Client not found" | client name h1, vehicle, `ServiceHistory` with Edit link `/dashboard/mechanic/clients/{id}/entries/{entryId}/edit` |
| `…/entries/[entryId]/edit.astro` | `service_entries.select("*, vehicles!inner(client_id)")…` (:16-23) | **swallowed** → 404 (:27-29) | "Entry not found" | form inputs `serviceType`, `serviceDate`, `mileage`, `cost`, … with raw DB `value=` |

- The client page runs the `clients` query with `.eq("user_id", user.id)` on top of
  RLS (`dashboard.astro:21-28`). This is deliberate, because a mechanic would
  otherwise also match `clients_select_mechanic`
  (`context/changes/testing-rls-visibility-matrix/research.md:140-145`).
- A user with no profile row passes the middleware (role undefined) and renders the
  client `/dashboard` (`middleware.ts:24,32-41`).
- Formatting (`src/lib/service-history.ts:4-18`):
  - Dates use `pl-PL` short month in UTC.
  - The "Edited" date uses Europe/Warsaw.
  - Mileage uses `pl-PL` grouping plus " km".
  - Cost uses PLN currency.
  - Exact-string assertions need whitespace normalization or must compute the
    expected value with the same `Intl` options. The runtime ICU output
    (workerd vs Node) was not executed.
- Per-entry render in `ServiceHistory.astro:20-50`:
  - `service_type` (:23) and the date (:25)
  - Mileage/Cost/Next-due dt-dd pairs (:34-43)
  - notes (:45)
  - `Edited …` guarded by truthy `updated_at` (:46-49)

### Render-path throw sites

On the inspected render path, every call site is in a child component (mid-stream):
- `sortNewestFirst` (`service-history.ts:26-30`). It throws on a null/undefined
  `service_date`, or on a null `created_at` when dates tie. Called in
  `ServiceHistory.astro:13`, and in `ClientDashboardView.astro` frontmatter via
  `nextService` (`service-history.ts:50-59`).
- `formatServiceDate` (:32-35). It throws `TypeError` on undefined, or `RangeError`
  on a malformed date. Called at `ServiceHistory.astro:25,43` and in
  `ClientDashboardView`.
- `formatEditedDate` (:37-39). It throws `RangeError` on an invalid timestamp.
  Called at `ServiceHistory.astro:48`, and guarded since f763bdb.
- These do not throw: `formatMileage(undefined)` renders "NaN km", and
  `formatCost(undefined)` renders "NaN zł" (`service-history.ts:41-47`).

### Role routing and API (risk #6)

- `src/middleware.ts:5,9-10`: `PROTECTED_ROUTES = ["/dashboard"]` with a `startsWith`
  prefix match on the pathname, trailing slash stripped.
- The profile role is fetched only when a user exists and the path is protected
  (:22-25). The error is ignored, and a null profile yields role `undefined`.
- The three redirects are at :28-29, :34-35 and :38-41. Astro's `context.redirect`
  default status is 302. The smoke asserts 302 on these paths
  (`scripts/smoke.mjs:38-83`).
- Post-sign-in redirect is `/` for every role (`src/pages/api/auth/signin.ts:19`).
  The auth pages do not redirect an authenticated user.
- API routes:
  - All handlers are POST.
  - The three `api/clients/**` routes re-check the mechanic role (anchors in Summary).
  - `api/share-link/{index,revoke}.ts` have no role check and rely on RPC/RLS.
  - The middleware does not load a profile for `/api/*`.
- Implication for the test: the risk #6 surface is page GETs to `/dashboard/mechanic*`
  as a client (expect 302 → `/dashboard`, and no mechanic data in the body), plus
  client POSTs to mechanic API routes (expect a redirect, no write). Loop-freedom
  can be asserted by following redirects manually and capping the hop count.

### Test infrastructure to extend

- **`scripts/smoke.mjs`** (83 lines, no dependencies):
  - `BASE_URL` defaults to `http://localhost:4321` (:4).
  - Unique user per run (:5-6).
  - Cookie jar built on `getSetCookie()`, sending `Cookie` plus `Origin`, with `redirect: "manual"` (:7-36).
  - Table-driven steps with PASS/FAIL output and `process.exit` (:38-83).
  - The step comment at :56 already expects a fresh signup to become a mechanic.
- **CI `.github/workflows/ci.yml`:**
  - Job `smoke` (:28-58) runs `supabase start` with extras excluded (:42), then
    writes `.env` from `API_URL`/`ANON_KEY` only (:43-47).
  - It copies `.env` to `.dev.vars` (:48), which is how workerd preview gets secrets.
  - Then `npm run test:db` (:49-50), `npm run build` (:51), `npm run preview --
    --port 4321 &` with a curl poll (:52-55), `npm run smoke` (:56), and
    `supabase stop` under `if: always()` (:57-58).
  - A dashboard suite fits after the smoke step and against the same preview.
- **DB fixtures (Phase 1):**
  - `tests/db/env.ts` loads `.env`, needs the anon key only, and probes `/auth/v1/health`.
  - `tests/db/clients.ts` `newClient()` makes one instance per actor.
  - `tests/db/fixtures.ts` `createWorkshopPair(label, runId)` (:36-110) creates:
    mechanic signup, the `create_client_with_vehicle` RPC (Toyota Corolla,
    `RLS-<L>-<runId>`), client signup, one entry (Oil change, 2026-09-01,
    120000 km, cost 250, edited so `updated_at` is set) and a share link.
  - Reuse needs `PASSWORD` exported and emails returned (:17).
  - `vitest.db.config.ts` includes only `tests/db/**` with `fileParallelism: false`.
    An HTTP suite needs its own include glob/config or script.
  - Fixtures must not import `src/lib/supabase.ts`, because `astro:env` does not
    resolve in Vitest (`testing-rls-visibility-matrix/plan.md:99-105`).
- **Auth budget** (`supabase/config.toml`):
  - Confirmations are off (:209), so sign-up returns a session at once.
  - `sign_in_sign_ups = 30` per 5 min (:190).
  - Today one CI run spends 4 sign-ups in `test:db` and 1 sign-up + 2 sign-ins in smoke.
  - An HTTP suite that calls `createWorkshopPair` (2 sign-ups) and then signs in
    through the app spends more of the same budget. Whether the server-side and
    Vitest calls share one IP bucket was not verified (both are localhost).
- **Seed** (`supabase/seed.sql`): fixed `mechanic@example.test` / `client@example.test`
  with password `password123`, a Toyota Corolla WX 12345 and one entry dated
  `current_date`. Phase 1 decided not to use the seed pair in assertions
  (`testing-rls-visibility-matrix/plan.md:35,46-47`).
- **Dev state pages** `/dev/dashboard-states` and `/dev/share-states` return 404 when
  `!import.meta.env.DEV` (`src/pages/dev/dashboard-states.astro:8-10`), so the built
  app cannot use them as HTTP targets.

## Code References

- `src/middleware.ts:5-44` - the only page role gate; fail-closed mechanic check at :38-41
- `src/pages/dashboard.astro:16-41` - client queries; `loadError` at :30
- `src/components/ClientDashboardView.astro:55-106` - alert / no-vehicle / entries branches
- `src/components/ServiceHistory.astro:13-50` - sort + per-entry formatters (mid-stream throw sites)
- `src/lib/service-history.ts:4-59` - pl-PL formatters, `sortNewestFirst`, `nextService`
- `src/pages/dashboard/mechanic.astro:20-27` - error swallowed into empty list
- `src/pages/dashboard/mechanic/clients/[id].astro:24-36` - error → 404
- `src/pages/api/clients/index.ts:20-23`, `[id]/entries.ts:21-24`, `[id]/entries/[entryId].ts:23-26` - API role re-check
- `src/pages/api/auth/signin.ts:13-19` - session cookie issuance, redirect `/`
- `scripts/smoke.mjs:4-83` - HTTP harness pattern (status/location only)
- `.github/workflows/ci.yml:28-58` - smoke job layout
- `tests/db/fixtures.ts:17,36-110` - seeding helper; private password
- `node_modules/astro/dist/runtime/server/render/page.js:40-57` - streaming branch
- `node_modules/astro/dist/core/pages/handler.js:73-83` - pre-Response error catch → 500
- `node_modules/@astrojs/cloudflare/dist/utils/handler.js:32` - `createApp()` defaults (streaming on)

## Architecture Insights

- The render pipeline has two distinct failure classes. A frontmatter throw gives a
  loud 500 with an empty body. A component/slot/island throw gives a silent 200 with
  a truncated or empty body. On the inspected pages, every data-dependent formatter
  is in the second class.
- Silent-failure surfaces separate into two kinds:
  - **Rendering failures** (mid-stream throws). The test detects them with the
    `</html>` plus late-marker oracle. Making them loud needs an app change
    (middleware buffering or disabling streaming).
  - **Query failures swallowed into empty states** (mechanic list, detail and edit
    pages). The test catches them only by asserting a positive seeded row. There is
    no visible error.
- Page-level role enforcement is centralized in middleware, while API routes carry
  their own check. A regression in either is independent of RLS, which Phase 1
  already covers.

## Historical Context (from prior changes)

- `context/changes/testing-rls-visibility-matrix/plan.md:43` puts dashboard/HTTP-level
  rendering explicitly out of scope and hands it to risk #1 / Phase 2. Its
  conventions carry over:
  - anon key only, no mocks (`plan.md:45`; `test-plan.md:119`)
  - fresh users per run (`plan.md:35`)
  - the rate-limit note (`test-plan.md:138`)
- `context/changes/testing-rls-visibility-matrix/reviews/impl-review.md:26-38` F1
  (PENDING): tests reusing `.env` could hit a hosted project, and a localhost guard
  was suggested. This applies equally to an HTTP suite that seeds via the fixtures.
- Commit f763bdb: `formatEditedDate(undefined)` threw mid-stream and gave an empty
  200. The fix was a truthy guard (`ServiceHistory.astro:46-47`) plus a migration
  rename. The mechanism above confirms the "empty 200" description on workerd with
  gzip. The ordering half belongs to risk #3 / Phase 4.
- `context/changes/mechanic-edits-service-entry/reviews/impl-review.md:75-83` F5
  describes the same symptom. It suggested `!= null`, but the code now uses a truthy
  check (supported, superseded by f763bdb).
- `context/changes/ui-theme-change-to-olive/reviews/impl-review.md:71-78` F4 said
  smoke expected 200 on `/dashboard` for a fresh signup who is actually a mechanic.
  This is **contradicted now**: `scripts/smoke.mjs:56` expects the mechanic forward.
  The other half, that smoke never reaches the client dashboard, is still supported.
- `context/archive/2026-09-26-client-dashboard-ui-audit/plan.md:255-272` fixed the four
  mutually exclusive client-dashboard branches (loadError → no vehicle → 0 entries →
  entries) and the `role="alert"` error card. `plan.md:309` decided no integration
  tests would be added then.
- `context/archive/2026-09-22-roles-and-domain-schema-foundation/plan.md:167-173` gives
  the redirect contract, and `plan-brief.md:45` named the loop risk that the
  exact-pathname check prevents. Verification there was manual only (`plan.md:185-187`).
- PRD US-01 (`context/foundation/prd.md:47-56`): the client sees the vehicle and the
  entry (type, date, cost, notes) without a manual sync. Roadmap F-01
  (`context/foundation/roadmap.md:78`): the two dashboard routes are gated by role.
- `docs/reference/contract-surfaces.md` does not exist (also noted in
  `testing-rls-visibility-matrix/research.md:246-247`).

## Related Research

- `context/changes/testing-rls-visibility-matrix/research.md`
- `context/archive/2026-09-26-client-dashboard-ui-audit/research.md`

## Open Questions

- **Scope decision for the plan: detect only, or also make failures loud?** Risk #1's
  proof wants "a render failure surfaces as a visible error, not an empty 200"
  (`test-plan.md:54`). Tests alone can detect a truncated body. Turning it into a
  500 or error page needs an app change: middleware buffering (verified in a workerd
  probe) or `src/fetch.ts` `streaming = false` (source-only). Swallowed query errors
  on the mechanic pages are a second app-side choice.
- **How to trigger a render failure deliberately** for a negative control against
  the built app, without mocks or a service-role key. Two candidates, neither
  verified: seed a row whose field breaks a formatter (DB constraints may prevent
  it), or test the oracle against a synthetic truncated response.
- **Adding `data-testid` markers** vs asserting on text and `href`s. Text is
  localized (`pl-PL`), and no testids exist today.
- **Harness form:** extend `scripts/smoke.mjs` (zero-dependency, exit-code) or add a
  Vitest HTTP suite that reuses `tests/db/fixtures.ts`. The second needs
  `PASSWORD`/emails exported and a separate include.
- **Not verified:**
  - exact `pl-PL` ICU output under workerd
  - the Cloudflare-edge bytes on a stream error in production
  - whether app-side and Vitest sign-ins share one rate-limit bucket
