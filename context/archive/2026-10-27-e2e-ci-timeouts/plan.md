# Stop the e2e CI job timing out on slow apt and image downloads — Implementation Plan

## Overview

The `e2e` job in `.github/workflows/ci.yml` was cancelled at its 15-minute limit on PR #21, although its 3 tests passed in about 12 s. The time went into outside downloads: about 12 minutes of apt packages from the Azure Ubuntu mirror inside `npx playwright install --with-deps chromium`, plus retries against AWS ECR Public while `supabase start` pulled images. This plan removes both dependencies so a slow mirror or a registry data limit can no longer use up the job budget.

## Current State Analysis

- `.github/workflows/ci.yml` (`e2e` job): `timeout-minutes: 15`; steps `npm ci` → `npx playwright install --with-deps chromium` → `supabase start -x …` → write `.env`/`.dev.vars` → `npm run test:e2e` → upload report on failure → `supabase stop`.
- Across 10 inspected e2e runs (research table), the install step took 19–31 s in the 7 runs up to 2026-10-27 12:48 UTC and 435–752 s in the 3 runs after. In run 40512421754 the log shows `Fetched 21.6 MB in 12min 14s (29.5 kB/s)`, while the browser download took about 5 s.
- `supabase start` (both the `smoke` and `e2e` jobs) pulls from `public.ecr.aws/supabase/*` by default, gets `toomanyrequests: Data limit exceeded`, backs off (4 s, 8 s) and falls back to `ghcr.io/supabase/*`. The step took 86–123 s across the 10 runs.
- `playwright.config.ts` uses the bundled Chromium (`devices["Desktop Chrome"]`, no `channel`). `@playwright/test` is 1.63.0.
- `context/foundation/lessons.md` does not exist.

## Desired End State

- The `e2e` job installs only the Chromium browser (`npx playwright install chromium`, no `--with-deps`) and restores it from an `actions/cache` entry on `~/.cache/ms-playwright` when one exists, so no apt step runs in the job.
- `SUPABASE_INTERNAL_IMAGE_REGISTRY: ghcr.io` is set at workflow level, so `supabase start` in `smoke` and `e2e` pulls from `ghcr.io` without first failing against ECR.
- Verified on this change's PR CI run: e2e passes, the install step takes under 60 s with no apt output, and neither job's log contains `public.ecr.aws`.

### Key Discoveries:

- `SUPABASE_INTERNAL_IMAGE_REGISTRY` overrides the CLI's default registry `public.ecr.aws` (Supabase CLI `apps/cli/src/command-internal/docker-registry.ts`; `apps/cli-go/internal/utils/docker.go:218-222`).
- GitHub's `ubuntu-latest` (24.04) image ships Google Chrome with its shared libraries, so the bundled Chromium is expected to launch without the extra apt packages. This is unverified until CI runs it (see Open risk).
- The Playwright container image was rejected: `supabase start` publishes its ports on the host, and the app reaches it at `127.0.0.1:54321`, which a `container:` job can't see.

## What We're NOT Doing

- No Playwright container image and no change to how the job reaches local Supabase.
- No caching of Docker images (`docker save`/`load`) and no `docker login` to GHCR. Anonymous GHCR pulls worked in the inspected log.
- No change to `timeout-minutes: 15`, `playwright.config.ts`, the tests, or the `ci` job.
- No apt timeout/retry tuning. With `--with-deps` gone, nothing in the job calls apt.

## Implementation Approach

One workflow edit: a top-level `env` entry for the registry, then in the `e2e` job replace the `--with-deps` install with a cache restore plus a plain browser install. The proof is the PR's own CI run, because the risk (missing OS libraries) only shows up on the real runner.

## Critical Implementation Details

- **Cache key must track the Playwright version.** Key the cache on `hashFiles('package-lock.json')` (with `runner.os`), so a Playwright upgrade invalidates it. Keep the `npx playwright install chromium` step unconditional: it is a no-op on a cache hit and fills a cache miss, so a stale or partial cache can't leave the job without a browser.
- **Fallback if Chromium won't launch.** If the e2e run fails with a browser launch error naming a missing `.so` library, add an `npx playwright install-deps chromium` step only for that case. That would be a structural mismatch to raise with the user, not a silent switch back to `--with-deps`.

## Phase 1: CI workflow skips apt deps, caches the browser and pulls Supabase images from ghcr.io

### Overview

Edit `.github/workflows/ci.yml` and prove the result on this change's PR CI run.

### Changes Required:

#### 1. Workflow-level registry override

**File**: `.github/workflows/ci.yml`

**Intent**: Make every `supabase start` in the workflow pull from `ghcr.io`, skipping the ECR data-limit failures and their back-off.

**Contract**: A top-level `env:` map with `SUPABASE_INTERNAL_IMAGE_REGISTRY: ghcr.io`, placed after `concurrency:` and before `jobs:`. It is inherited by the `ci`, `smoke` and `e2e` jobs; only `smoke` and `e2e` run the Supabase CLI.

#### 2. e2e browser install without apt

**File**: `.github/workflows/ci.yml` (`e2e` job)

**Intent**: Stop the job from downloading OS packages through apt, and reuse the downloaded browser between runs.

**Contract**: Replace the `npx playwright install --with-deps chromium` step with (a) an `actions/cache@v4` step for path `~/.cache/ms-playwright`, key `playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}`, and (b) `npx playwright install chromium`. The step order stays: `npm ci` → cache → install → Start local Supabase.

### Success Criteria:

#### Automated Verification:

- Workflow file parses as YAML and contains no `--with-deps`
- Lint passes: `npm run lint`

#### Manual Verification:

- PR CI run: `e2e` passes and its Playwright install step takes under 60 s with no apt output
- PR CI run: neither the `smoke` nor the `e2e` log contains `public.ecr.aws`

**Implementation Note**: The manual checks are read from the PR's GitHub Actions logs once the run finishes.

## Testing Strategy

### Integration Tests:

- The existing E2E suite (`npm run test:e2e`, 3 tests) and smoke/HTTP/DB suites are the regression check; this plan adds no tests.

### Manual Testing Steps:

1. Open the PR and wait for CI.
2. In the `e2e` job, check the duration of the Playwright install step and that the step's log has no `apt-get`/`Get:` lines.
3. Search the `smoke` and `e2e` logs for `public.ecr.aws` (expect none) and `ghcr.io/supabase` (expect pulls).

## Performance Considerations

Healthy e2e runs total 151–234 s today. Expected after the change: about the same on a normal day. The difference is that a slow mirror or an ECR data limit no longer adds minutes.

## References

- Research: `context/changes/e2e-ci-timeouts/research.md`
- Incident run: https://github.com/gitprzemekoz/car-service-history/actions/runs/40512421754
- `6b8f1f3` "CI: run Playwright E2E in a dedicated job (#17)": origin of the `--with-deps` step

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: CI workflow skips apt deps, caches the browser and pulls Supabase images from ghcr.io

#### Automated

- [x] 1.1 Workflow file parses as YAML and contains no --with-deps — 8defe12
- [x] 1.2 Lint passes — 8defe12

#### Manual

- [x] 1.3 PR CI run: e2e passes and its Playwright install step takes under 60 s with no apt output — 8defe12
- [x] 1.4 PR CI run: neither the smoke nor the e2e log contains public.ecr.aws — 8defe12
