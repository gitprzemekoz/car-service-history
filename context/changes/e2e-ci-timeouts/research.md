---
date: 2026-10-27T14:00:17Z
researcher: Claude (Opus 5.5) with Przemek Kozinski
git_commit: dc2f872
branch: ci/e2e-job-speedup
repository: gitprzemekoz/car-service-history
topic: "Why the e2e CI job hits its 15-minute timeout although the tests pass in ~12 s, and what makes it reliable"
tags: [research, ci, github-actions, playwright, supabase-cli, e2e]
status: complete
last_updated: 2026-10-27
last_updated_by: Claude (Opus 5.5)
---

# Research: e2e CI job timeouts

**Date**: 2026-10-27T14:00:17Z
**Researcher**: Claude (Opus 5.5) with Przemek Kozinski
**Git Commit**: dc2f872
**Branch**: ci/e2e-job-speedup
**Repository**: gitprzemekoz/car-service-history

## Research Question

The `e2e` job in `.github/workflows/ci.yml` was cancelled at its 15-minute limit on PR #21 (run 40512421754), although the tests passed. Which steps consume the time, why, and which changes make the job reliable? The seed hypothesis was "slow apt mirror + Docker Hub rate limit; use the Playwright container image".

## Summary

- **The dominant cost is the apt download inside `npx playwright install --with-deps chromium`, not the tests.** In the 10 e2e job runs inspected (step timings from the GitHub API, run IDs below), that step took 19–31 s in the 7 runs from 2026-10-03 to 2026-10-27 12:48 UTC, and 652 s, 752 s and 435 s+ (cancelled) in the three runs after that. In run 40512421754 attempt 1 the log shows `Fetched 21.6 MB in 12min 14s (29.5 kB/s)` from `azure.archive.ubuntu.com`. The Chromium binary itself downloaded from `cdn.playwright.dev` in about 5 s in the same log.
- **The "rate limit" is AWS ECR Public, not Docker Hub.** In the same log, `supabase start` pulls `public.ecr.aws/supabase/{kong,postgrest,gotrue,postgres,realtime}`, gets `toomanyrequests: Data limit exceeded`, retries with back-off (4 s, 8 s) and then falls back to `ghcr.io/supabase/...`. Across the 10 runs, `Start local Supabase` took 86–123 s, so this costs tens of seconds per run, not minutes. It is the CLI's default registry (`public.ecr.aws`), and `SUPABASE_INTERNAL_IMAGE_REGISTRY` overrides it (Supabase CLI source, `apps/cli/src/command-internal/docker-registry.ts` and `apps/cli-go/internal/utils/docker.go:218-222`).
- **Tests take 10–14 s** in the 9 runs where the step ran, so the 15-minute budget is consumed by downloads.
- **The Playwright container image does not fit this job as written.** The job runs `supabase start`, which starts sibling Docker containers and the app reaches them at `127.0.0.1:54321` (written to `.env` by the job). In a GitHub `container:` job those ports are published on the host, not inside the job container, so the URL and the Docker daemon access would both have to be re-plumbed. That is a structural change, not a swap of base image.
- The `smoke` job runs the same `supabase start` command (`.github/workflows/ci.yml`, smoke job) and is exposed to the same ECR fallback; it does not run `playwright install`.

## Detailed Findings

### Step timings of the `e2e` job (GitHub API, `actions/runs/<id>/jobs?filter=all`)

| Run | Date (UTC) | Attempt | Result | Job total | `playwright install --with-deps` | `Start local Supabase` | E2E tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 37115647930 | 2026-10-03 | 1 | success | 151 s | 25 s | 87 s | 11 s |
| 37115841630 | 2026-10-03 | 1 | success | 154 s | 21 s | 86 s | 13 s |
| 38471703435 | 2026-10-13 | 1 | success | 171 s | 20 s | 100 s | 12 s |
| 38590093693 | 2026-10-14 | 1 | success | 182 s | 31 s | 92 s | 14 s |
| 38591099612 | 2026-10-14 | 1 | success | 169 s | 27 s | 90 s | 13 s |
| 40506695958 | 2026-10-27 12:48 | 1 | success | 234 s | 19 s | 123 s | 12 s |
| 40507270859 | 2026-10-27 12:52 | 1 | success | 800 s | 652 s | 104 s | 10 s |
| 40512421754 | 2026-10-27 13:29 | 1 | cancelled | 913 s | 752 s | 120 s | 12 s (3 passed) |
| 40512421754 | 2026-10-27 | 2 | cancelled | 467 s | 435 s (cancelled) | — | — |

Runs 40515798218 and 40516393303 were still in progress when the data was collected and are not counted.

### Inside the slow install (run 40512421754 attempt 1 log)

- `apt-get update` fetched 12.6 MB in 1 s at 13:29:38.
- Package download then ran until 13:41:54: `Fetched 21.6 MB in 12min 14s (29.5 kB/s)`, with an `Ign:` on `fonts-freefont-ttf` at 13:34:15, all from `http://azure.archive.ubuntu.com/ubuntu`.
- `Downloading Chrome for Testing 153.0.8010.12` started at 13:41:58 and the headless shell finished at 13:42:05.
- Conclusion for this run: about 12 minutes of the 12.5-minute step went to apt; the browser download was not the problem.

### Supabase image pulls (same log)

- First pull attempts at 13:42:07 hit `public.ecr.aws/supabase/kong:2.8.1`, `postgrest:v16.5`, `gotrue:v2.197.0`, `postgres:17.11.0.006` → `toomanyrequests: Data limit exceeded`, retried after 4 s and 8 s, then pulled from `ghcr.io/supabase/...`. `realtime:v2.147.1` followed the same path later.
- The registry choice is in the CLI: the default is `public.ecr.aws`; `SUPABASE_INTERNAL_IMAGE_REGISTRY` set to `ghcr.io` (or `docker.io`) rewrites image URLs to that registry, and the pull path can fall back through GHCR (Supabase CLI `docker-registry.ts` header comment; `docker.go:218-258`).
- CI installs the CLI with `supabase/setup-cli@v1` at `version: latest` (`.github/workflows/ci.yml`, smoke and e2e jobs), so the exact version varies per run. The local devDependency (`supabase@^2.23.4`) is not what CI uses.

### Workflow and config that the fix touches

- `.github/workflows/ci.yml`, `e2e` job: `timeout-minutes: 15`, steps `npm ci` → `npx playwright install --with-deps chromium` → `supabase start -x ...` → write `.env`/`.dev.vars` from `supabase status` → `npm run test:e2e` → upload report on failure → `supabase stop`.
- `playwright.config.ts`: one `chromium` project using `devices["Desktop Chrome"]` (bundled Chromium, no `channel`), and a `webServer` that runs `npm run build && npm run preview` with a 180 s timeout.
- `@playwright/test` is `1.63.0` (installed version), so a browser cache key can be the Playwright version from `package-lock.json`.

## Code References

- `.github/workflows/ci.yml` (`e2e` job) - `timeout-minutes: 15`, `npx playwright install --with-deps chromium`, `supabase start` and `.env` generation
- `.github/workflows/ci.yml` (`smoke` job) - same `supabase start` command, no Playwright install
- `playwright.config.ts:24-31` - `chromium` project on `devices["Desktop Chrome"]`
- `playwright.config.ts:32-39` - `webServer` build + preview, 180 s timeout

## Architecture Insights

- Options compared against the observed data:
  - **Split browser and OS dependencies; cache the browser.** `actions/cache` on `~/.cache/ms-playwright`, keyed on the Playwright version, saves only the ~5 s browser download. Apt time is unaffected unless OS packages are also skipped or cached.
  - **Skip `--with-deps` on the GitHub `ubuntu-latest` image.** It ships a preinstalled Google Chrome, whose shared-library dependencies overlap most of what Chromium needs. Whether the bundled Chromium starts without the extra packages (notably fonts) is **not verified** here; one CI run settles it, and a failure would surface as a browser launch error, not a timeout.
  - **Run `install-deps` only as a fallback**, or bound apt with `Acquire::http::Timeout`/retries, so a slow mirror fails or retries quickly instead of eating the job budget.
  - **Playwright container image** (`mcr.microsoft.com/playwright:v1.63.0-noble`) removes apt and browser download, but conflicts with `supabase start` networking/Docker access as noted in the Summary.
  - **`SUPABASE_INTERNAL_IMAGE_REGISTRY: ghcr.io`** at workflow or job level skips the ECR failure and back-off. Pulling from GHCR anonymously worked in the inspected log; `docker/login-action` with `GITHUB_TOKEN` against `ghcr.io` is optional.
- The 15-minute timeout itself is reasonable: healthy runs total 151–234 s.

## Historical Context (from prior changes)

- `6b8f1f3` "CI: run Playwright E2E in a dedicated job (#17)" introduced the `e2e` job with `--with-deps`. No change folder under `context/changes/**` or `context/archive/**` records a reason for `--with-deps` or for not using the container image (searched for `with-deps`, `playwright install`, `ms-playwright`, `container`).
- `context/changes/testing-rls-visibility-matrix/reviews/impl-review.md:37` notes that Docker-in-Docker setups reaching Supabase via another hostname would need an opt-in. That supports the container-image networking concern.

## Related Research

Not applicable; no earlier research on CI performance exists in `context/`.

## Open Questions

- Does the bundled Chromium (headless shell) launch on `ubuntu-latest` without `--with-deps`? This can only be verified by running CI.
- Was the slow Azure mirror a one-day incident or will it recur? Only today's three runs show it, so the fix should hold even if the mirror is slow again, not just shave seconds.
