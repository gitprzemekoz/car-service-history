# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-29

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/migrations/`
(5 in-scope commits in the last 30 days — squash-merged, so churn signal is coarse).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|--------------------------------|
| 1 | A logged-in client or mechanic gets a blank 200 page although their data exists — no error, no alert | High | High | interview Q1, Q2; commit `f763bdb` (blank dashboards incident); PRD US-01 acceptance criteria; hot-spot dirs `src/lib/` (14 changes/30d), `src/components/` (13 changes/30d) |
| 2 | An RLS policy or migration change hides a client's own data, or exposes another client's / another workshop's data | High | High | interview Q3, Q4; PRD Success Criteria Guardrails, NFR (privacy), FR-003; hot-spot dir `supabase/migrations/` (5 changes/30d) |
| 3 | A migration applies cleanly to a fresh database but is skipped or applied out of order on an already-migrated database, leaving the deployed schema behind the code | High | Medium | interview Q2; commit `f763bdb` (migration skipped as out-of-order) |
| 4 | A mechanic edits a service entry of a client outside their workshop, or an edit overwrites/loses history (IDOR on the write path) | High | Medium | PRD FR-006, Guardrail "history integrity"; roadmap S-02 Risk; hot-spot dir `src/pages/api/` (8 changes/30d) |
| 5 | A share link exposes cost, stays valid after 24h, or grants access to a different vehicle | High | Medium | PRD FR-005; roadmap S-03 Risk; hot-spot dir `src/pages/api/` (8 changes/30d) |
| 6 | A user reaches the other role's area: a client gets mechanic pages/API data, or role redirects loop | Medium | Medium | roadmap F-01 outcome; hot-spot dirs `src/components/auth/` (11 changes/30d), `src/pages/auth/` (6 changes/30d) |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | A client with a seeded entry sees that entry's service type and date on their dashboard; a render failure surfaces as a visible error, not an empty 200 | "HTTP 200 means the page works" | How dashboard pages load data; what happens to an exception thrown mid-stream during SSR | integration against the built app + local Supabase (extends the smoke pattern) | Asserting only on status 200; HTML snapshots |
| #2 | Role × resource matrix: each role reads exactly its own rows; foreign rows return zero rows, not an error the UI swallows | "Authenticated means authorized"; "empty result means correct result" | RLS policies per table; how to create test users with roles; anon key vs service-role key | DB integration (Vitest + local Supabase, one client per role) | Querying with the service-role key (bypasses RLS); mocking Supabase |
| #3 | Migrations from a PR applied on top of a database in `main`'s state yield the same schema as a fresh reset | "`supabase db reset` passes, so migrations are fine" | How Supabase CLI treats a migration timestamped before the last applied one | CI gate (ordering + schema parity check) | Testing only against a fresh database |
| #4 | Mechanic B cannot change mechanic A's entry; after a legitimate edit, the history keeps the entry intact and marks it edited | "The UI hides the button, so it is protected" | Edit endpoint; server-side ownership check vs RLS; what happens to the prior value | API + RLS integration | Happy-path-only test on the mechanic's own entry |
| #5 | The public share response contains no cost in any field; after 24h access is denied; vehicle X's token never opens vehicle Y | "Hidden in the UI means not sent" | Data source of the public view; where expiry is computed; what the existing `src/lib/` unit tests already cover | unit for expiry + integration for response redaction | Expected value copied from the implementation (oracle problem) |
| #6 | A client requesting mechanic routes or API gets a denial/redirect, never data; no redirect loop for either role | "Middleware checks the session, so it checks the role" | Where the role is enforced: middleware, page, or RLS | HTTP integration (fetch with session cookie, smoke style) | Browser e2e where a cookie-carrying fetch suffices |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | RLS visibility matrix + test gate | Run `npm test` in CI and prove each role sees exactly its own rows on a real database | #2 | DB integration (Vitest + local Supabase), CI gate | done | context/changes/testing-rls-visibility-matrix/ |
| 2 | Dashboard data-render protection | Prove existing data actually renders for each role and failures are loud, not a blank 200; role routing holds | #1, #6 | HTTP integration against built app | not started | — |
| 3 | Write-path and share-link abuse | Prove edits cannot cross workshops or lose history, and share links never leak cost or outlive 24h | #4, #5 | API + RLS integration, unit | not started | — |
| 4 | Migration parity gate | Stop out-of-order or skipped migrations in CI before they reach the deployed database | #3 | CI gate, optional post-edit hook | not started | — |

## 4. Stack

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit | Vitest | ^5.0.1 | Configured (`environment: node`, `src/**/*.test.ts(x)`); 4 test files, all in `src/lib/` — profile `sparse` |
| DB / RLS integration | Vitest + local Supabase (CLI) | supabase ^2.23.4 | `tests/db/**/*.test.ts` run by `vitest.db.config.ts` via `npm run test:db` (separate from `npm test`); anon key only, needs `npx supabase start` |
| HTTP integration | Node fetch against `astro preview` | n/a | Existing zero-dependency smoke script is the pattern; extended in Phase 2 |
| e2e | none | — | Not planned; HTTP integration covers the risks at lower cost |
| CI gates | GitHub Actions | n/a | Job `ci`: lint, `astro check`, `npm test`, build. Job `smoke`: local Supabase, `npm run test:db`, build, smoke (since §3 Phase 1) |

**Stack grounding tools (current session):**
- Docs: none (Context7 not available in current session) — stack confirmed from local manifests/configs only; checked: 2026-09-29
- Search: none (Exa.ai not available in current session) — not used; checked: 2026-09-29
- Runtime/browser: `claude-in-chrome` browser skill — not used; HTTP integration is the cheaper layer for these risks; checked: 2026-09-29
- Provider/platform: GitHub via `gh` CLI (no MCP); no Supabase or Cloudflare MCP — relevant only for inspecting CI runs; checked: 2026-09-29

## 5. Quality Gates

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck (`eslint`, `astro check`) | local (lint-staged) + CI | required | syntactic / type drift |
| build + smoke against preview | CI | required | broken build, auth flow, Cloudflare adapter |
| unit tests (`npm test`) | CI job `ci` | required (since §3 Phase 1) | logic regressions |
| DB integration (`npm run test:db`) | CI job `smoke` | required (since §3 Phase 1) | RLS visibility regressions |
| HTTP integration on dashboards | CI | required after §3 Phase 2 | blank-render and role-routing regressions |
| migration parity check | CI on PR | required after §3 Phase 4 | skipped / out-of-order migrations |
| post-edit hook (Vitest related tests) | local (agent loop) | optional after §3 Phase 4 | regressions at edit time |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- **Location**: next to the unit under test in `src/`, named `<module>.test.ts` (matches `vitest.config.ts` include).
- **Reference test**: `src/lib/validation.test.ts`.
- **Run locally**: `npm test`.

### 6.2 Adding an RLS / database integration test

- **Location**: `tests/db/`, named `<topic>.test.ts` (matches `vitest.db.config.ts` include; never picked up by `npm test`).
- **Reference test**: `tests/db/rls-visibility.test.ts`.
- **Fixture helper**: `tests/db/fixtures.ts` (`createWorkshopPair`) builds a fresh mechanic + client + vehicle + entry + share link through the anon key; `tests/db/clients.ts` gives one isolated client per actor.
- **Rule**: anon key only (no service-role key, no direct Postgres, no mocks). Every read asserts the exact own-row id set, and every foreign-id read asserts `data` equals `[]` with `error === null`, next to the owner-side read of the same ids.
- **Run locally**: `npx supabase start`, then `npm run test:db`.

### 6.3 Adding a test for a new dashboard or page

- TBD — see §3 Phase 2 for the seeded-data-renders / no-blank-200 pattern.

### 6.4 Adding a test for a new API endpoint

- TBD — see §3 Phase 3 for the cross-workshop write denial and share-link redaction pattern.

### 6.5 Adding a migration

- TBD — see §3 Phase 4 for the migration ordering / parity gate.

### 6.6 Per-rollout-phase notes

(Appended after each phase lands.)

- **2026-09-29 — Phase 1 (RLS visibility matrix)**: each run signs up fresh users (4 sign-ups), so exact own-row sets hold even though test rows accumulate locally (no DELETE policies; clear with `npx supabase db reset`). Local auth allows 30 sign-ups per 5 min (`supabase/config.toml`), so more than ~7 back-to-back runs can hit HTTP 429. `service_entry_revisions` is invisible to every API role, so its positive control is indirect: the edit returns a non-null `updated_at`, set by the same trigger that writes the revision.

## 7. What We Deliberately Don't Test

- **Visual regression and UI snapshot tests** — the theme changes often and snapshots catch nothing useful here. Re-evaluate if a rendering regression reaches users that an HTTP integration test could not have caught. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-29
- Stack versions last verified: 2026-09-29
- AI-native tool references last verified: 2026-09-29

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive (e.g. S-05 email reminders or S-04 entry flagging ship),
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
