<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: RLS Visibility Matrix + CI Test Gate

- **Plan**: context/changes/testing-rls-visibility-matrix/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-29
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Evidence summary: diff `f763bdb..922ce20` touches exactly the planned files plus the change's context docs. Every Changes Required item is MATCH (drift agent). The expectation map matches the SELECT policies in all four migrations, and every read asserts `error === null`. Foreign-id checks re-assert the owner's positive control first (`assertOwnersSee`). Re-run on 2026-09-29: `npm run lint`, `npm test` (50), `npm run test:db` (58) and `npx astro check` are green. `SUPABASE_URL=http://127.0.0.1:1 npm run test:db` exits 1 with the guidance message. The `ci.yml` steps sit in the planned jobs, and PR #10 CI is green. Harmless extras: `hookTimeout: 60_000`, the `DbClient`/`Actor` type exports, the session-required check in `signUp`, and `--reporter=verbose` in CI (a declared adaptation).

## Findings

### F1 — DB suite will write to a hosted project if .env points there

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/db/env.ts:9-26
- **Detail**: The guard checks only that SUPABASE_URL/SUPABASE_KEY are set and that `/auth/v1/health` answers. README.md:119-127 documents putting a hosted project (`https://<project-ref>.supabase.co`) into the same `.env`. A developer with that setup who runs `npm run test:db` signs up 4 real users per run and inserts clients, vehicles, entries, revisions and share links into the hosted DB. Nothing ever cleans them up (by plan). Current local `.env` is `http://127.0.0.1…`, so there is no exposure today.
- **Fix**: Refuse to run unless the URL host is `127.0.0.1`/`localhost` (error names the override), with an explicit opt-in env var such as `DB_TESTS_ALLOW_REMOTE=1`.
  - Strength: Turns a silent data-pollution path into a loud failure. CI (`API_URL` from `supabase status`, 127.0.0.1) is unaffected.
  - Tradeoff: One more env knob; a future remote test run needs the opt-in.
  - Confidence: HIGH — CI and local both use 127.0.0.1 today.
  - Blind spot: Docker-in-Docker or devcontainer setups that reach Supabase via a hostname like `host.docker.internal` would need the opt-in.
- **Decision**: PENDING

### F2 — Optional manual check 3.6 ticked with no throwaway PR on record

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/testing-rls-visibility-matrix/plan.md:377
- **Detail**: Progress 3.6 ("A throwaway PR that loosens one SELECT policy … makes the smoke job fail at test:db") is `[x] — eb0685e`. The repo's PR list shows only #7–#10, all merged, with no throwaway PR. Phase 2's local mutation checks (2.4/2.5) cover the same regression class, and the check was optional. Still, the tick claims CI-level evidence that doesn't exist.
- **Fix**: Either run the throwaway PR now, or annotate row 3.6 as `(skipped — optional; covered locally by 2.4/2.5)` in a follow-up commit.
- **Decision**: PENDING

### F3 — test-plan §6.6 says "no DELETE policies"; share_links has one

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-plan.md:138
- **Detail**: `share_links_delete_client` exists (`supabase/migrations/20260928130000_share_links.sql:58`). The conclusion (rows accumulate; the suite never deletes) still holds. The imprecise wording came from the plan's "What We're NOT Doing" section.
- **Fix**: Reword to "the suite never deletes rows (most tables have no DELETE policy)".
- **Decision**: PENDING

### F4 — CI hardening gaps the new gate now depends on

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:1-9, :36-43
- **Detail**: Two gaps predate this change, but the required `test:db` gate now relies on them. The workflow has no top-level `permissions:` block, so the token scope follows repo defaults. `supabase/setup-cli@v1` uses `version: latest`, and a CLI rename of `ANON_KEY` in `status -o env` would break the job. It would at least fail loudly: the grep exits 1.
- **Fix**: Add `permissions: { contents: read }` and pin the Supabase CLI version, as a follow-up outside this change.
- **Decision**: PENDING
