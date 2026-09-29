# Dashboard data-render protection (test-plan Phase 2) Implementation Plan

## Overview

Close test-plan risks #1 and #6.

- **Visible failures.** A render failure on an HTML page must become a visible 500
  instead of a silent blank 200. The mechanic client list must show an alert when its
  query fails, instead of an empty state.
- **HTTP proof.** An HTTP suite runs against the built app (`astro preview` on workerd
  plus local Supabase). It proves three things:
  - each role's seeded data actually renders;
  - a truncated or empty page fails the test;
  - role routing holds, meaning a client never reaches mechanic pages or API writes,
    and no redirect loops.

## Current State Analysis

From `context/changes/testing-dashboard-data-render/research.md`:

- **Streaming.** Astro 7.3.2 on the Cloudflare adapter always streams. The 200 Response
  exists before child components render (`node_modules/astro/dist/runtime/server/render/page.js:40-57`,
  `@astrojs/cloudflare/dist/utils/handler.js:32`).
- **Mid-stream throws.** A throw in a child component, in `<Layout>` slot content, or in an
  island yields 200 with a truncated body. With `accept-encoding: gzip` the body is empty,
  and the stream still ends cleanly.
- **Frontmatter throws.** Only a page-frontmatter throw becomes a 500. `src/pages/500.astro`
  does not exist.
- **Throw sites.** Every inspected throwable formatter is called from child components.
  They are `sortNewestFirst`, `formatServiceDate` and `formatEditedDate`
  (`src/lib/service-history.ts:26-39`), called from `ServiceHistory.astro` and
  `ClientDashboardView.astro`. This is the f763bdb incident class.
- **Swallowed query error.** `src/pages/dashboard/mechanic.astro:20-27` reads only `data`
  (`data ?? []`), so a failed query renders "No clients yet." The client dashboard already
  has `loadError` → `role="alert"` (`src/pages/dashboard.astro:30`,
  `src/components/ClientDashboardView.astro:55-65`).
- **Page role gate.** `src/middleware.ts:28-41` is the only page role gate. The three
  mechanic POST routes re-check `profiles.role` and redirect to `/dashboard`
  (`src/pages/api/clients/index.ts:20-23`, `[id]/entries.ts:21-24`,
  `[id]/entries/[entryId].ts:23-26`). No GET API routes exist.
- **Test tooling today.**
  - No `data-testid` exists in `src/`.
  - `scripts/smoke.mjs` asserts only status and `location`.
  - `tests/db/fixtures.ts` seeds through the anon key. Its password is module-private
    (`:17`) and `Actor` carries no email (`:3-6`).
- **Seeding bad data is impossible.** DB column types (`date`, `integer not null`,
  `timestamptz not null`) prevent seeding a formatter-breaking row
  (`supabase/migrations/20260922120000_roles_and_domain_schema.sql:107-118`,
  `20260923120000_service_entry_loop.sql:15-16`). The negative control must therefore use
  synthetic streams.

## Desired End State

- **Render errors.** Any HTML response whose render throws mid-stream reaches the client as
  HTTP 500 with a visible `role="alert"` error page, and the error is logged by Astro. Redirects
  and non-HTML responses are unchanged.
- **Mechanic list.** A failed clients query on `/dashboard/mechanic` renders a `role="alert"`
  error card, not "No clients yet."
- **HTTP suite.** `npm run test:http` passes against a local preview with fresh seeded pairs. It
  asserts:
  - the page-completeness oracle (`</html>` plus an end-of-page marker);
  - seeded rows by id and service type;
  - the absence of the other pair's rows;
  - role redirects;
  - denial of client writes to the mechanic API.
- **CI.** The `smoke` CI job runs `npm run test:http` after smoke against the same preview.
- **Docs.** `context/foundation/test-plan.md` §3 row 2 is `done` with the change folder, §5 notes
  the gate is active, §6.3 has the cookbook, and §6.6 has a phase note.

### Key Discoveries:

- Astro re-attaches `context.cookies` to whatever Response middleware returns
  (`node_modules/astro/dist/core/middleware/astro-middleware.js:42`). Rebuilding the Response
  in middleware therefore keeps Supabase `Set-Cookie`.
- An error thrown from middleware (not from the route callback) is logged and rendered as 500 through
  `renderErrorFromState` (`astro-middleware.js:60-68`). That handler uses `src/pages/500.astro` when present
  (`core/errors/default-handler.js:35-90`).
- The workerd probe in the research confirmed that `await res.text()` on a body that fails mid-stream rejects.
- `supabase/config.toml:190` allows 30 sign-ins plus sign-ups per 5 min.
  - Today's CI spends 4 sign-ups (`test:db`) plus 3 auth calls (smoke).
  - This plan adds 4 sign-ups (2 pairs) plus about 4 app sign-ins, well under the cap.
- `tests/db/env.ts` has top-level await and fails loudly when Supabase is down. It can be reused by the HTTP suite.

## What We're NOT Doing

- No change to `/dashboard/mechanic/clients/[id]` or `…/edit` error handling. They keep mapping query errors
  to 404, a documented choice.
- No fault-injection route or test-only code path in the shipped app.
- No `src/fetch.ts` / `streaming = false` approach, and no Astro config changes.
- No browser e2e, no HTML snapshots, no visual regression (test-plan §7).
- No changes to `scripts/smoke.mjs`. It stays the status-only smoke.
- No service-role key, no direct Postgres, no Supabase mocks in the HTTP suite.
- No coverage of share-link (`/share/[token]`) data rendering or write-path IDOR (test-plan Phase 3). The
  share page only benefits incidentally from the buffering middleware.
- No migration-ordering gate (test-plan Phase 4).

## Implementation Approach

- **Fix the failure mode, then test it.**
  - Phase 1 turns the silent blank 200 into a loud 500 at one central point (middleware buffering of HTML).
    Unit tests with synthetic, mid-stream-failing bodies are the negative control.
  - Phase 2 adds a small, stable marker vocabulary and fixes the one swallowed-error page mechanics rely on.
  - Phase 3 builds the HTTP suite on the Phase 1 fixture and cookie-jar patterns.
  - Phase 4 wires it into CI and records the pattern in the test plan.
- **Why not detect only.** Detection in tests alone was rejected, because production users would still get a
  blank page.
- **Why not smoke.mjs.** Extending `smoke.mjs` was rejected, because it cannot seed fresh data and handles body
  assertions poorly.

## Critical Implementation Details

- **Ordering in the buffering middleware.**
  - The auth and role redirects must still return early, before `next()`.
  - Buffering applies only to the Response from `next()`, and only when its `content-type` starts with
    `text/html` and it has a body.
  - The buffered Response must carry the original `status`, `statusText` and `headers`.
  - A rejection from reading the body must propagate (not be caught into a 200) so Astro's middleware error
    fallback renders the 500.
- **Page-completeness oracle.** Tests must send `accept-encoding: identity`, so a regression that bypasses
  buffering yields a diagnosable partial body rather than 0 bytes. The oracle must check both `</html>` and the
  `page-end` marker, because neither alone distinguishes a truncated page from a short one.

## Phase 1: Visible render failure

### Overview

Buffer HTML responses in middleware so a mid-stream render error becomes a 500, and add a visible 500 page.

### Changes Required:

#### 1. HTML buffering helper

**File**: `src/lib/buffer-html.ts` (new)

**Intent**: Isolate the buffering logic in a pure function so it can be unit-tested without `astro:middleware`.
It reads an HTML response fully and returns an equivalent non-streamed Response. When the body stream errors,
it rejects with that error.

**Contract**: `export async function bufferHtmlResponse(response: Response): Promise<Response>`.
- **HTML responses** (`content-type` starting with `text/html`, non-null body): return
  `new Response(await response.text(), { status, statusText, headers })` built from the original.
- **Any other response** (redirects, JSON, empty bodies): return it unchanged, the same object.
- **Body stream errors:** the rejection propagates.

#### 2. Middleware wiring

**File**: `src/middleware.ts`

**Intent**: Replace the final `return next();` (`:43`) with buffering of the downstream response. A mid-render
throw then surfaces through Astro's middleware error fallback as a logged 500.

**Contract**: `return bufferHtmlResponse(await next());`. The early redirects at `:28-41` are unchanged. Add a
one-line comment tying it to the blank-200 incident (f763bdb).

#### 3. Visible 500 page

**File**: `src/pages/500.astro` (new)

**Intent**: Give the 500 a human-visible error instead of Astro's empty-body default.

**Contract**:
- Static page using `Layout` with a `role="alert"` message: "Something went wrong while loading this page.
  Please try again in a moment." Add a link to `/`.
- No data access and no dependence on `Astro.locals`.
- Accepts Astro's `error` prop but does not render it, so no stack is leaked to users.

#### 4. Unit tests: negative control

**File**: `src/lib/buffer-html.test.ts` (new)

**Intent**: Prove the buffering turns a mid-stream failure into a rejection, and leaves healthy and non-HTML
responses intact.

**Contract**: Vitest cases using `ReadableStream` bodies:
- A healthy multi-chunk HTML body buffers to the identical text. Status and headers are preserved, including
  multiple `set-cookie` values via `getSetCookie()`.
- A body that enqueues `<!doctype html><html><body>partial` and then calls `controller.error(new Error("boom"))`
  makes `bufferHtmlResponse` reject with "boom".
- A 302 redirect and an `application/json` response are returned as the same object, unread.
- An HTML response with `null` body is returned unchanged.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the new buffer-html suite: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build succeeds: `npm run build`
- Existing smoke still passes against a local preview: `npm run smoke`

#### Manual Verification:

- Temporarily make `ServiceHistory.astro` throw during render, then build and run `npm run preview`. Signed in
  as a seeded client, `/dashboard` returns HTTP 500 with the visible alert page, and the preview logs show the
  error. Revert the temporary throw afterwards.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Stable markers and mechanic-list alert

### Overview

Add a minimal `data-testid` vocabulary for HTTP assertions, and make the mechanic client list show an alert when
its query fails.

### Changes Required:

#### 1. End-of-page marker

**File**: `src/layouts/Layout.astro`

**Intent**: Give tests an unambiguous "the whole page rendered" marker after all slot content.

**Contract**: `<div data-testid="page-end" hidden></div>` placed after `<slot />`, immediately before `</body>`.

#### 2. Service entry rows

**File**: `src/components/ServiceHistory.astro`

**Intent**: Let tests find a specific seeded entry regardless of copy or locale formatting.

**Contract**:
- `<ul>` gets `data-testid="service-history"`.
- Each `<li>` gets `data-testid="service-entry"` and `data-entry-id={entry.id}`.
- The `service_type` span gets `data-testid="service-type"`.

#### 3. Mechanic client rows and load error

**File**: `src/pages/dashboard/mechanic.astro`

**Intent**: Make client rows addressable, and stop rendering a failed query as the empty state. This mirrors the
client dashboard's `loadError` pattern.

**Contract**:
- Destructure `error` from the clients query (`:20-25`) and set `loadError = Boolean(error)`.
- When `loadError` is true, render a `role="alert"` card instead of the list and empty state:
  "Your clients couldn't be loaded. Please try again in a moment." plus a "Try again" link to
  `/dashboard/mechanic`. Match the markup and classes of `ClientDashboardView.astro:55-65`.
- Each client `<a>` row gets `data-testid="client-row"` and `data-client-id={client.id}`.
- `AddClientForm` stays rendered in all branches.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build succeeds: `npm run build`
- The markers exist in the source (rendered presence is asserted in Phase 3):
  `grep -rn 'data-testid="page-end"\|data-testid="service-entry"\|data-testid="client-row"' src/`

#### Manual Verification:

- `/dashboard` (client) and `/dashboard/mechanic` look visually unchanged in `npm run dev`.
- With Supabase stopped or the query temporarily broken, `/dashboard/mechanic` shows the alert card and not
  "No clients yet."

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: HTTP integration suite

### Overview

A Vitest suite that seeds fresh pairs through the anon key, signs in through the app, and asserts rendered data
and role routing against a running preview.

### Changes Required:

#### 1. Fixture exports

**File**: `tests/db/fixtures.ts`

**Intent**: Let the HTTP suite sign in through the app as fixture users without duplicating fixture logic.

**Contract**:
- `export const PASSWORD`.
- `Actor` gains `email: string`, set in `signUp`.

Phase 1 DB tests must keep passing unchanged.

#### 2. HTTP config and script

**Files**: `vitest.http.config.ts` (new), `package.json`

**Intent**: A separate suite that `npm test` and `npm run test:db` never pick up.

**Contract**:
- Config: include `tests/http/**/*.test.ts`, `fileParallelism: false`, `testTimeout` 30s, `hookTimeout` 60s,
  node environment, modelled on `vitest.db.config.ts`.
- Script: `"test:http": "vitest run --config vitest.http.config.ts"`.

#### 3. HTTP helpers

**Files**: `tests/http/app.ts` (new), `tests/http/page.ts` (new)

**Intent**:
- `app.ts` provides the cookie-jar HTTP client (ported from `scripts/smoke.mjs:7-36`) and app sign-in.
- `page.ts` provides the page-completeness oracle.

**Contract**:

`app.ts`:
- `BASE_URL` comes from env, defaulting to `http://localhost:4321`.
- It refuses a BASE_URL whose host is not `localhost` or `127.0.0.1`, throwing with a clear message. This
  addresses Phase 1 impl-review F1 for this suite.
- A top-level-await health check `GET BASE_URL/` fails loudly with a message naming
  `npm run build && npm run preview`.
- `class Session { request(path, { method?, form? }): Promise<Response> }` uses `redirect: "manual"`,
  `Origin: BASE_URL`, `accept-encoding: identity`, and a `getSetCookie()` jar that drops `max-age=0`.
- `signInAs(actor: Actor): Promise<Session>` POSTs `/api/auth/signin` and asserts a 302 to `/`.
- `anonymous(): Session`.

`page.ts`:
- `assertCompletePage(html: string)` asserts the trimmed body ends with `</html>` and contains
  `data-testid="page-end"`.
- `entryIds(html)` and `clientIds(html)` extract `data-entry-id` / `data-client-id` values with a regex.

#### 4. Oracle self-test

**File**: `tests/http/page.test.ts` (new)

**Intent**: Prove the oracle rejects blank and truncated pages. This is a negative control at the oracle level
and needs no server.

**Contract**:
- `assertCompletePage` throws for `""`, for a body truncated before `</html>`, and for a complete document
  missing `page-end`.
- It passes for a minimal complete document with the marker.
- The file must not import `app.ts`, so it runs without a preview.

#### 5. Data-render tests

**File**: `tests/http/dashboard-render.test.ts` (new)

**Intent**: Risk #1 proof. Seeded data renders for each role, and the other pair's data does not.

**Contract**: `beforeAll` builds pairs A and B via `createWorkshopPair` and signs in client A and mechanic A.
Cases:
- Client A `GET /dashboard`:
  - 200, `assertCompletePage`;
  - `entryIds` equals exactly `[A.entryId]`;
  - the entry's `service-type` text is "Oil change";
  - the body contains A's registration `RLS-A-<runId>`;
  - B's entry id and registration are absent;
  - no `role="alert"`.
- Mechanic A `GET /dashboard/mechanic`:
  - 200, complete;
  - `clientIds` contains A's `clientRowId` and not B's.
- Mechanic A `GET /dashboard/mechanic/clients/<A.clientRowId>`:
  - 200, complete;
  - `entryIds` equals `[A.entryId]`;
  - the body contains the Edit href for that entry.
- Mechanic A `GET …/clients/<B.clientRowId>`: 404 and complete (the foreign client, RLS miss).
- Mechanic A `GET …/clients/<A.clientRowId>/entries/<A.entryId>/edit`:
  - 200, complete;
  - the `serviceType` input value is "Oil change".

#### 6. Role-routing tests

**File**: `tests/http/role-routing.test.ts` (new)

**Intent**: Risk #6 proof. A client gets redirects and never mechanic data or writes. No loops for any role.

**Contract**: Uses pair A, built in its own `beforeAll`, and a new runId label so it is independent of the
render file.
- Anonymous: `GET /dashboard` and `GET /dashboard/mechanic` each return 302 to `/auth/signin`.
- Client A: `GET /dashboard/mechanic`, `…/clients/<A.clientRowId>` and `…/entries/<A.entryId>/edit` each
  return 302 to `/dashboard`, and the response body contains no `data-client-id`.
- Client A: `POST /api/clients` (valid form) and `POST /api/clients/<A.clientRowId>/entries` (valid form) each
  return 302 to `/dashboard`.
  - Afterwards, mechanic A's list `clientIds` is unchanged.
  - Client A's `/dashboard` `entryIds` still equals `[A.entryId]`.
- Mechanic A: `GET /dashboard` returns 302 to `/dashboard/mechanic`.
- **Loop check.** For each of anon, client A and mechanic A, follow `location` manually from `/dashboard` and
  `/dashboard/mechanic`, capped at 5 hops. The chain must end in a 200 complete page (anon ends at
  `/auth/signin`) within the cap.

### Success Criteria:

#### Automated Verification:

- Phase 1 DB suite still passes after the fixture changes: `npm run test:db`
- HTTP suite passes against a local preview (`npx supabase start`, `npm run build`, `npm run preview`):
  `npm run test:http`
- Unit tests still pass and do not pick up `tests/http`: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

#### Manual Verification:

- Temporarily inserting a throw in `ServiceHistory.astro` (rebuild plus preview) makes `dashboard-render.test.ts`
  fail on the 500 status. Revert afterwards.
- `npm run test:http` with preview stopped fails fast with the health-check message.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: CI gate and test-plan update

### Overview

Run the HTTP suite in CI against the existing preview, and record the pattern in the test plan.

### Changes Required:

#### 1. CI step

**File**: `.github/workflows/ci.yml`

**Intent**: Make the dashboard HTTP suite a required gate, reusing the preview the smoke step already starts.

**Contract**: In job `smoke`, add a step after "smoke" (`:56`) and before `supabase stop`:
`BASE_URL=http://localhost:4321 npm run test:http -- --reporter=verbose`. `.env` is already written at `:44-48`.
No new secrets.

#### 2. Test plan

**File**: `context/foundation/test-plan.md`

**Intent**: Record Phase 2 as shipped and give future contributors the recipe.

**Contract**:
- §3 row 2: Status `done`, Change folder `context/changes/testing-dashboard-data-render/`.
- §4 HTTP integration row notes: `tests/http/**` via `vitest.http.config.ts` / `npm run test:http`.
- §4 CI row: the `smoke` job now also runs `test:http`.
- §5: the "HTTP integration on dashboards" gate notes it is required since Phase 2.
- §6.3 replaces TBD with:
  - location `tests/http/<topic>.test.ts`;
  - reference test `tests/http/dashboard-render.test.ts`;
  - helpers `tests/http/app.ts` (`signInAs`, `Session`) and `tests/http/page.ts` (`assertCompletePage`, id
    extractors);
  - rule: every page assertion calls `assertCompletePage` and asserts seeded ids via `data-testid` markers,
    never status alone;
  - run locally with `npx supabase start`, `npm run build`, `npm run preview`, then `npm run test:http`.
- §6.6 appends a dated Phase 2 note:
  - HTML responses are buffered in `src/middleware.ts`, so render errors are 500s;
  - the negative control is unit-level (`src/lib/buffer-html.test.ts`, `tests/http/page.test.ts`), because DB
    types prevent seeding a formatter-breaking row;
  - the auth-budget arithmetic.
- "Last updated" date bumped.

### Success Criteria:

#### Automated Verification:

- Workflow YAML is valid and the step is present: `npx prettier --check .github/workflows/ci.yml`
- Test-plan formatting is clean: `npx prettier --check context/foundation/test-plan.md`
- CI run on the PR is green for both jobs `ci` and `smoke`, with `test:http` output visible: `gh pr checks`

#### Manual Verification:

- CI logs show the `test:http` step running after smoke, with all dashboard-render and role-routing cases listed.
- The test-plan §6.3 recipe reads correctly to someone who did not see this conversation.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `src/lib/buffer-html.test.ts`: healthy passthrough with headers/cookies, mid-stream error rejects, non-HTML and
  null-body passthrough.
- `tests/http/page.test.ts`: the oracle rejects empty, truncated and marker-less bodies, and accepts complete ones.

### Integration Tests:

- `tests/http/dashboard-render.test.ts`: the exact seeded entry and client ids per role, the foreign pair absent,
  and the edit form carrying seeded values.
- `tests/http/role-routing.test.ts`: anon, client and mechanic redirects, client API write denial with an
  unchanged-state check, and loop-freedom within 5 hops.

### Manual Testing Steps:

1. Inject a temporary throw into `ServiceHistory.astro`, build, preview, and load `/dashboard` as a client:
   expect 500 plus the alert page plus a logged error. Revert.
2. Run the HTTP suite with the injected throw and confirm `dashboard-render` fails on status. Revert.
3. Break the mechanic clients query temporarily: `/dashboard/mechanic` shows the alert card. Revert.

## Performance Considerations

Buffering removes streaming for HTML pages. That means no early flush and slightly higher TTFB. Dashboard pages are
small and database-bound, so the user-visible cost is negligible. Redirects, API responses and static assets are
not buffered.

## Migration Notes

None. No schema or data changes. The fixture `Actor.email` addition is additive for the Phase 1 suite.

## References

- Related research: `context/changes/testing-dashboard-data-render/research.md`
- Test plan: `context/foundation/test-plan.md` (§2 risks #1, #6; §3 Phase 2)
- Phase 1 conventions: `context/changes/testing-rls-visibility-matrix/plan.md`
- Cookie-jar pattern: `scripts/smoke.mjs:7-36`
- Error-card pattern: `src/components/ClientDashboardView.astro:55-65`
- Astro cookie re-attach after middleware: `node_modules/astro/dist/core/middleware/astro-middleware.js:42`
- Astro middleware error fallback: `node_modules/astro/dist/core/middleware/astro-middleware.js:46-69`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Visible render failure

#### Automated

- [x] 1.1 Unit tests pass, including the new buffer-html suite — 9711221
- [x] 1.2 Lint passes — 9711221
- [x] 1.3 Type check passes — 9711221
- [x] 1.4 Build succeeds — 9711221
- [x] 1.5 Existing smoke still passes against a local preview — 9711221

#### Manual

- [x] 1.6 Injected ServiceHistory throw returns 500 with the visible alert page and a logged error — 9711221

### Phase 2: Stable markers and mechanic-list alert

#### Automated

- [x] 2.1 Unit tests pass — 46221cb
- [x] 2.2 Lint passes — 46221cb
- [x] 2.3 Type check passes — 46221cb
- [x] 2.4 Build succeeds — 46221cb
- [x] 2.5 The markers exist in the source — 46221cb

#### Manual

- [x] 2.6 Client and mechanic dashboards look visually unchanged — 46221cb
- [x] 2.7 Failed mechanic clients query shows the alert card, not the empty state — 46221cb

### Phase 3: HTTP integration suite

#### Automated

- [x] 3.1 Phase 1 DB suite still passes after the fixture changes — 177f8bb
- [x] 3.2 HTTP suite passes against a local preview — 177f8bb
- [x] 3.3 Unit tests still pass and do not pick up tests/http — 177f8bb
- [x] 3.4 Lint passes — 177f8bb
- [x] 3.5 Type check passes — 177f8bb

#### Manual

- [x] 3.6 Injected ServiceHistory throw makes dashboard-render fail with a 500 status — 177f8bb
- [x] 3.7 test:http with preview stopped fails fast with the health-check message — 177f8bb

### Phase 4: CI gate and test-plan update

#### Automated

- [x] 4.1 Workflow YAML is valid and the step is present
- [x] 4.2 Test-plan formatting is clean
- [ ] 4.3 CI run on the PR is green for both jobs with test:http output visible

#### Manual

- [ ] 4.4 CI logs show test:http running after smoke with all cases listed
- [ ] 4.5 Test-plan §6.3 recipe reads correctly to a newcomer
