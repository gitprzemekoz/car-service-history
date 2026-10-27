# Stop the e2e CI job timing out on slow downloads — Plan Brief

> Full plan: `context/changes/e2e-ci-timeouts/plan.md`
> Research: `context/changes/e2e-ci-timeouts/research.md`

## What & Why

The `e2e` CI job hits its 15-minute limit although its tests pass in about 12 s. The time goes into outside downloads: apt packages from a slow Ubuntu mirror during `playwright install --with-deps`, and Supabase images that first fail against AWS ECR Public's data limit. A slow third-party server should not be able to fail our CI.

## Starting Point

`.github/workflows/ci.yml` installs Chromium plus its OS packages through apt on every e2e run, and the Supabase CLI pulls from `public.ecr.aws` before falling back to `ghcr.io`. Healthy runs take 151–234 s; the three runs after 2026-10-27 12:48 UTC spent 435–752 s in the install step alone.

## Desired End State

The e2e job installs only the browser, restored from cache when possible, and runs no apt step. Both Supabase jobs pull their images straight from `ghcr.io`. A slow mirror or a registry data limit no longer adds minutes to CI.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Where the time goes | apt download, not tests or browser | 12 min at 29.5 kB/s from the Azure mirror; browser ~5 s; tests ~12 s | Research |
| Rate limit source | AWS ECR Public, not Docker Hub | Log shows `public.ecr.aws/supabase/*` → `Data limit exceeded` → GHCR fallback | Research |
| Playwright container image | Rejected | `supabase start` ports live on the host; the app reaches `127.0.0.1:54321` | Research |
| OS dependencies | Skip `--with-deps`, cache `~/.cache/ms-playwright` | The runner image already ships Chrome's libraries, so the job no longer touches apt | Plan |
| Registry override scope | Workflow level (smoke + e2e) | One line removes the ECR back-off from both Supabase jobs | Plan |

## Scope

**In scope:**
- `SUPABASE_INTERNAL_IMAGE_REGISTRY: ghcr.io` as a workflow-level env
- e2e: cache step plus `npx playwright install chromium` in place of `--with-deps`

**Out of scope:**
- Container image, Docker image caching, `docker login`
- Timeout value, Playwright config, tests, the `ci` job

## Architecture / Approach

Edit one file. Set the registry once for the whole workflow, then in the e2e job restore the browser cache and install the browser without OS packages. The PR's own CI run is the test.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. CI workflow: skip apt deps, cache browser, pull from ghcr.io | Edited `ci.yml`, proven green on the PR run | Chromium may need a library the runner lacks |

**Prerequisites:** none. GHCR images are public.
**Estimated effort:** one short session plus one CI run.

## Open Risks & Assumptions

- Assumes the bundled Chromium launches on `ubuntu-latest` without extra packages. If not, add a guarded `npx playwright install-deps chromium` step after asking the user.
- Assumes anonymous GHCR pulls stay within limits. They did in the inspected log.

## Success Criteria (Summary)

- The e2e job passes on the PR with a Playwright install step under 60 s and no apt output.
- No `public.ecr.aws` pulls in the `smoke` or `e2e` logs.
