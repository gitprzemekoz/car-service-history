# Apply Supabase migrations before every production deploy — Implementation Plan

## Overview

Production deploys run through Cloudflare Workers Builds (push to `main` → `npm run build` → `npx wrangler deploy`). Nothing in that pipeline applies `supabase/migrations/` to the hosted Supabase project, so on 2026-10-27 production ran against a database with none of the four migrations. `profiles` did not exist, and every signed-in user got the middleware's 503 on `/dashboard`. This change adds one `npm run deploy` entry point that runs `supabase db push` and then `wrangler deploy`. Workers Builds uses it as its production deploy command, so the schema always lands before the code that needs it, and a failed migration stops the deploy.

## Current State Analysis

- `.github/workflows/ci.yml` only tests (lint, check, unit, build, smoke, DB, HTTP, E2E against a local Supabase). It never deploys.
- `README.md:152-176` documents Workers Builds as the primary deploy path and `npx wrangler deploy` as the manual fallback. Migrations to the hosted project are described as a manual `supabase link` + `supabase db push` (`context/changes/deployment/deployment-plan.md:33`), which was never done.
- `supabase` (`^2.23.4`) and `wrangler` (`^4.131.1`) are already devDependencies, so both binaries exist in the Workers Builds image after `npm ci`. No new dependency is needed.
- `package.json` has no `deploy` script. `scripts/` holds dependency-free Node scripts (`smoke.mjs`), and that style should be kept.
- Production project ref: `khuxupqlivgmikebcubq`. As of this change, its migration history has been brought up to date by hand (`supabase db push` on 2026-10-27).

## Desired End State

- `npm run deploy` runs `supabase db push --db-url "$SUPABASE_DB_URL"` and then `wrangler deploy`. If `SUPABASE_DB_URL` is missing it exits non-zero before touching anything, and any failed step stops the chain.
- The Workers Builds production deploy command is `npm run deploy`, and `SUPABASE_DB_URL` is a build-time secret there. Preview (non-production) builds keep `wrangler versions upload` and never touch the production database.
- The README's Deployment section says migrations are applied by the deploy, and it lists the one-time dashboard setup.

### Key Discoveries:

- `supabase db push --db-url` works without `supabase login`/`link` or an access token. It needs only a Postgres connection string, which suits a CI build that cannot run an interactive login (the login failure earlier in this incident shows why).
- The direct host `db.<ref>.supabase.co` is IPv6-only. Build containers generally have IPv4 only, so the URL must be the **session pooler** string (port 5432, user `postgres.<ref>`) from Supabase → Connect.
- `db push` is idempotent: with nothing pending it reports the remote database is up to date and exits 0, so running it on every deploy is safe.

## What We're NOT Doing

- No GitHub Actions deploy or migrate job (option rejected: it would race Workers Builds).
- No migrations from preview/PR builds, and no seeding (`supabase/seed.sql` stays local-only; `db push` does not run it without `--include-seed`).
- No rollback automation for migrations. `wrangler rollback` still reverts code only.
- No backfill of `profiles` for accounts created before the schema existed.

## Implementation Approach

Write a small Node script (`scripts/deploy.mjs`) rather than a shell one-liner in `package.json`, so the env guard and fail-fast chaining behave the same in Workers Builds (Linux) and on a Windows laptop running the manual fallback. It shells out to the local `supabase` and `wrangler` binaries via `npx` and passes extra CLI args through to `wrangler deploy`.

## Critical Implementation Details

- **Never print the DB URL.** It contains the database password. Pass it as an argument to the child process and do not echo the command line.
- **Order and exit codes.** `wrangler deploy` must run only if `db push` exited 0, and the script must exit with the failing child's code so Workers Builds marks the build as failed.

## Phase 1: Deploy script runs migrations before wrangler deploy

### Changes Required:

#### 1. `scripts/deploy.mjs` (new)

Guard `SUPABASE_DB_URL`, run `npx supabase db push --db-url <url>`, then `npx wrangler deploy ...process.argv.slice(2)`, using `spawnSync` with `stdio: "inherit"` and exiting on the first non-zero status.

#### 2. `package.json`

Add `"deploy": "node scripts/deploy.mjs"`.

### Success Criteria:

#### Automated Verification:

- `node scripts/deploy.mjs` with `SUPABASE_DB_URL` unset exits 1 with a clear message and runs neither CLI.
- `npm run lint` passes.

## Phase 2: Document the deploy pipeline and one-time Cloudflare setup

### Changes Required:

#### 1. `README.md` — Deployment section

Automatic deploys: say that Workers Builds' deploy command is `npm run deploy` (migrations, then deploy), and add the one-time setup: set the deploy command, and add `SUPABASE_DB_URL` (session pooler string) as a build secret. Manual fallback: replace `npx wrangler deploy` with `npm run deploy` and the env var.

### Success Criteria:

#### Manual Verification:

- In Cloudflare → Worker → Settings → Build: the deploy command is `npm run deploy` and the `SUPABASE_DB_URL` build secret is set.
- The next push to `main` has build logs showing `supabase db push` ("Remote database is up to date" or the applied migrations) before the `wrangler deploy` output, and the deploy succeeds.

## References

- Incident: 503 "Service temporarily unavailable" on `/dashboard` for fresh accounts; `supabase migration list --linked` showed all four migrations missing remotely.
- `src/middleware.ts:40-46`: profile lookup → 503 on a non-`PGRST116` error.
- `context/changes/deployment/deployment-plan.md`: Workers Builds setup.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Deploy script runs migrations before wrangler deploy

#### Automated

- [x] 1.1 Deploy script exits 1 without SUPABASE_DB_URL
- [x] 1.2 Lint passes

### Phase 2: Document the deploy pipeline and one-time Cloudflare setup

#### Manual

- [ ] 2.1 Workers Builds deploy command and SUPABASE_DB_URL build secret configured
- [ ] 2.2 Next main deploy log shows db push before wrangler deploy
